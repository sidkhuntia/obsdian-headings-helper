import { Editor, EditorPosition, EditorSelection, App, Notice } from 'obsidian';
import { HeadingLevel, HeadingHelperSettings, LineInfo } from './types';
import { MarkdownParser } from './parser';
import { HierarchyChecker } from './hierarchy-checker';

export class HeadingOperations {
    private hierarchyChecker: HierarchyChecker;

    constructor(private settings: HeadingHelperSettings, private app?: App) {
        this.hierarchyChecker = new HierarchyChecker(settings);
    }

    /**
     * Cycle heading level for current line or selection
     */
    async cycleHeading(editor: Editor, direction: 'up' | 'down' | 'cycle' = 'cycle'): Promise<void> {
        if (!this.settings.enableCycling) return;

        const selections = editor.listSelections();

        // Process each selection
        for (const selection of selections) {
            await this.processSelection(editor, selection, direction);
        }
    }

    /**
     * Set specific heading level for current line or selection - only works with headings
     */
    async setHeadingLevel(editor: Editor, targetLevel: HeadingLevel, lineNumber?: number): Promise<void> {
        if (lineNumber !== undefined) {
            // Set specific line - only if it's a heading or if targeting paragraph from H6
            const lineText = editor.getLine(lineNumber - 1);
            const parsed = MarkdownParser.parseLine(lineText);
            const isHeading = parsed.level !== HeadingLevel.Paragraph;
            const isH6ToParagraph = (targetLevel === HeadingLevel.Paragraph && parsed.level === HeadingLevel.H6);
            const canTransform = isHeading || isH6ToParagraph;

            if (canTransform) {
                // Use hierarchy checking if app is available
                if (this.app) {
                    await this.hierarchyChecker.checkAndWarnHierarchy(
                        this.app,
                        editor,
                        parsed.level,
                        targetLevel,
                        lineNumber,
                        () => this.transformLine(editor, lineNumber - 1, targetLevel)
                    );
                } else {
                    // Fallback without hierarchy checking
                    this.transformLine(editor, lineNumber - 1, targetLevel);
                }
            }
        } else {
            // Set for current selection
            const selections = editor.listSelections();
            for (const selection of selections) {
                await this.processSelectionWithLevel(editor, selection, targetLevel);
            }
        }
    }

    private async processSelection(editor: Editor, selection: EditorSelection, direction: 'up' | 'down' | 'cycle'): Promise<void> {
        const { anchor, head } = selection;
        const startLine = Math.min(anchor.line, head.line);
        const endLine = Math.max(anchor.line, head.line);

        // Collect all proposed transformations first
        const transformations: { lineNum: number; currentLevel: HeadingLevel; targetLevel: HeadingLevel; }[] = [];

        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const lineText = editor.getLine(lineNum);
            const parsed = MarkdownParser.parseLine(lineText);

            // Only process lines that are already headings
            if (parsed.level !== HeadingLevel.Paragraph) {
                const newLevel = MarkdownParser.cycleHeading(parsed.level, direction, this.settings.wrapAfterH6);
                const constrainedLevel = this.applyLevelConstraints(newLevel);

                if (constrainedLevel !== parsed.level) {
                    transformations.push({
                        lineNum,
                        currentLevel: parsed.level,
                        targetLevel: constrainedLevel
                    });
                }
            }
        }

        // Execute batch transformation with single hierarchy check
        await this.executeBatchTransformation(editor, transformations, direction, startLine, endLine);
    }

    private async processSelectionWithLevel(editor: Editor, selection: EditorSelection, targetLevel: HeadingLevel): Promise<void> {
        const { anchor, head } = selection;
        const startLine = Math.min(anchor.line, head.line);
        const endLine = Math.max(anchor.line, head.line);

        // Collect all proposed transformations first
        const transformations: { lineNum: number; currentLevel: HeadingLevel; targetLevel: HeadingLevel; }[] = [];

        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const lineText = editor.getLine(lineNum);
            const parsed = MarkdownParser.parseLine(lineText);

            // Only process lines that are already headings, unless target is paragraph and current is H6
            const isHeading = parsed.level !== HeadingLevel.Paragraph;
            const isH6ToParagraph = (targetLevel === HeadingLevel.Paragraph && parsed.level === HeadingLevel.H6);
            const canTransform = isHeading || isH6ToParagraph;

            if (canTransform && parsed.level !== targetLevel) {
                transformations.push({
                    lineNum,
                    currentLevel: parsed.level,
                    targetLevel: targetLevel
                });
            }
        }

        // Execute batch transformation with single hierarchy check
        await this.executeBatchTransformation(editor, transformations, 'set', startLine, endLine);
    }

    /**
     * Execute batch transformation: apply all changes first, then check hierarchy once
     */
    private async executeBatchTransformation(
        editor: Editor,
        transformations: { lineNum: number; currentLevel: HeadingLevel; targetLevel: HeadingLevel; }[],
        operationType: 'up' | 'down' | 'cycle' | 'set',
        selectionStartLine: number, // 0-indexed
        selectionEndLine: number    // 0-indexed
    ): Promise<void> {
        if (transformations.length === 0) return;

        const originalStates = transformations.map(t => ({
            lineNum: t.lineNum, // 0-indexed
            originalText: editor.getLine(t.lineNum),
            originalLevel: t.currentLevel
        }));

        const originalLevelsInSelectionMap = new Map<number, HeadingLevel>();
        for (let i = selectionStartLine; i <= selectionEndLine; i++) {
            const lineText = editor.getLine(i); // Get current text before any transformations in this batch
            const transformedStateForThisLine = originalStates.find(s => s.lineNum === i);

            if (transformedStateForThisLine) {
                // If this line IS one of the lines being transformed, its originalLevel is in originalStates
                originalLevelsInSelectionMap.set(i, transformedStateForThisLine.originalLevel);
            } else {
                // If this line is in selection but NOT explicitly in transformations, parse its current state as original
                const parsed = MarkdownParser.parseLine(lineText);
                originalLevelsInSelectionMap.set(i, parsed.level);
            }
        }

        // Apply all transformations first
        for (const transformation of transformations) {
            this.transformLine(editor, transformation.lineNum, transformation.targetLevel);
        }

        if (this.app && transformations.length > 0 && this.settings.checkHierarchy) { // Added checkHierarchy setting
            const shouldContinue = await this.checkBatchHierarchy(
                editor,
                transformations,
                originalLevelsInSelectionMap,
                operationType,
                selectionStartLine,
                selectionEndLine
            );

            if (!shouldContinue) {
                for (const original of originalStates) {
                    editor.replaceRange(
                        original.originalText,
                        { line: original.lineNum, ch: 0 },
                        { line: original.lineNum, ch: editor.getLine(original.lineNum).length }
                    );
                }
            }
        }
    }

    /**
     * Check hierarchy for batch operations - returns false if operation should be blocked
     */
    private async checkBatchHierarchy(
        editor: Editor,
        transformations: { lineNum: number; currentLevel: HeadingLevel; targetLevel: HeadingLevel; }[],
        originalLevelsInSelectionMap: Map<number, HeadingLevel>,
        operationType: 'up' | 'down' | 'cycle' | 'set',
        selectionStartLine: number, // 0-indexed
        selectionEndLine: number   // 0-indexed
    ): Promise<boolean> {
        // No need to check this.settings.checkHierarchy here as it's checked by caller
        if (transformations.length === 0) {
            return true;
        }

        const batchIssues = this.analyzeBatchTransformation(
            editor,
            transformations,
            originalLevelsInSelectionMap,
            selectionStartLine,
            selectionEndLine
        );

        if (batchIssues.length === 0) {
            return true;
        }

        const primaryIssue = batchIssues[0];
        // Attempt to find a transformation that directly caused or represents the primary issue for a better notice context.
        const representativeTransformation =
            transformations.find(t => t.lineNum === (primaryIssue.lineNumber ? primaryIssue.lineNumber - 1 : -1)) || // Match by line number, ensure primaryIssue.lineNumber is defined
            transformations.find(t => t.currentLevel === primaryIssue.currentLevel && t.targetLevel === primaryIssue.targetLevel) || // Match by levels
            transformations[0]; // Fallback

        const warningDetails = {
            type: primaryIssue.type,
            // Use levels from the primary issue itself for accuracy, fallback to representative if not present
            currentLevel: primaryIssue.currentLevel !== undefined ? primaryIssue.currentLevel : representativeTransformation.currentLevel,
            targetLevel: primaryIssue.targetLevel !== undefined ? primaryIssue.targetLevel : representativeTransformation.targetLevel,
            lineNumber: primaryIssue.lineNumber !== undefined ? primaryIssue.lineNumber : (representativeTransformation ? representativeTransformation.lineNum + 1 : 0), // Fallback for lineNumber
            message: primaryIssue.message
        };

        new Notice(warningDetails.message, 5000); // User changed to 5000ms

        // For "direct set", always allow after warning, unless it's a critical, non-overridable block.
        // Critical blocks (like H6->Para w/o wrap, orphaning) should ideally have very specific types
        // if they are to bypass the 'set' leniency. For now, 'set' is lenient for all 'hierarchy_break', 'demotion_blocked', 'promotion_blocked'.
        if (operationType === 'set') {
            // However, certain fundamental issues should probably still block 'set' or lead to no-op
            // e.g., H6->Para without wrapAfterH6 is a direct violation, not just hierarchy.
            // For now, sticking to user's "direct set allow operation and just issue a warning"
            return true;
        }

        const isBlockingWarning = warningDetails.type === 'hierarchy_break' ||
            warningDetails.type === 'demotion_blocked' ||
            warningDetails.type === 'promotion_blocked';

        if (isBlockingWarning && !this.settings.allowHierarchyOverride) {
            return false; // Block operation
        }

        return true; // Allow operation (either override is on, or it's a non-blocking warning)
    }

    /**
     * Analyze batch transformation for hierarchy issues
     */
    private analyzeBatchTransformation(
        editor: Editor,
        transformations: { lineNum: number; currentLevel: HeadingLevel; targetLevel: HeadingLevel; }[],
        originalLevelsInSelectionMap: Map<number, HeadingLevel>,
        selectionStartLine: number,
        selectionEndLine: number
    ): { type: string; message: string; currentLevel?: HeadingLevel; targetLevel?: HeadingLevel; lineNumber?: number }[] { // Optionalized some for general warnings
        const issues: { type: string; message: string; currentLevel?: HeadingLevel; targetLevel?: HeadingLevel; lineNumber?: number }[] = [];
        if (transformations.length === 0) return issues;

        const getOriginalSelectionLevel = (lineNum: number): HeadingLevel => {
            return originalLevelsInSelectionMap.get(lineNum) || HeadingLevel.Paragraph;
        };

        const minTransformedLineNum = Math.min(...transformations.map(t => t.lineNum));
        const maxTransformedLineNum = Math.max(...transformations.map(t => t.lineNum));
        // selectionLevelsAfterTransform reflects the state *after* the current batch of transformations.
        const selectionLevelsAfterTransform = this.getHeadingLevelsInRange(editor, minTransformedLineNum, maxTransformedLineNum);


        // --- Rule Checks ---

        // 1. Critical Block: H6 to Paragraph violation (Direct transformation check)
        transformations.forEach(t => {
            if (t.currentLevel === HeadingLevel.H6 && t.targetLevel === HeadingLevel.Paragraph && !this.settings.wrapAfterH6) {
                issues.push({
                    type: 'demotion_blocked', // This is a critical block
                    message: `Cannot demote H6 to Paragraph: "Wrap after H6" is disabled.`,
                    currentLevel: t.currentLevel,
                    targetLevel: t.targetLevel,
                    lineNumber: t.lineNum + 1
                });
            }
        });

        // 2. Critical Block: Higher level to Paragraph orphaning lower levels (Post-transform state check)
        const higherToParaTransforms = transformations.filter(t =>
            t.targetLevel === HeadingLevel.Paragraph &&
            t.currentLevel >= HeadingLevel.H1 && t.currentLevel <= HeadingLevel.H5
        );
        higherToParaTransforms.forEach(t => {
            const originalTransformedLevel = t.currentLevel;
            for (let orphanedCandidateLevel = originalTransformedLevel + 1; orphanedCandidateLevel <= HeadingLevel.H6; orphanedCandidateLevel++) {
                // Check if this orphanedCandidateLevel exists *anywhere* in the selection *after* transformations
                let presentInSelectionAfterTransform = false;
                for (let lineIdx = selectionStartLine; lineIdx <= selectionEndLine; lineIdx++) {
                    const currentLineLevelAfterTransform = MarkdownParser.parseLine(editor.getLine(lineIdx)).level;
                    if (currentLineLevelAfterTransform === orphanedCandidateLevel) {
                        presentInSelectionAfterTransform = true;
                        break;
                    }
                }
                if (presentInSelectionAfterTransform) {
                    issues.push({
                        type: 'hierarchy_break', // This is a critical block
                        message: `Converting H${originalTransformedLevel} to Paragraph may orphan H${orphanedCandidateLevel} headings within the selection.`,
                        currentLevel: t.currentLevel,
                        targetLevel: t.targetLevel,
                        lineNumber: t.lineNum + 1
                    });
                    break;
                }
            }
        });

        // 3. Conditional Block: Promotion to H1 when H1 already in original selection
        //    "when h2 cant go to h1 if h1 is already there in selection" - applying to any promotion to H1
        const promotionsToH1 = transformations.filter(t => t.targetLevel === HeadingLevel.H1 && t.currentLevel > HeadingLevel.H1);
        if (promotionsToH1.length > 0) {
            let preExistingH1InOriginalSelection = false;
            for (let i = selectionStartLine; i <= selectionEndLine; i++) {
                // Check only lines that were NOT part of this promotion to H1 attempt
                const isCurrentlyBeingPromotedToH1 = promotionsToH1.some(p => p.lineNum === i);
                if (!isCurrentlyBeingPromotedToH1 && getOriginalSelectionLevel(i) === HeadingLevel.H1) {
                    preExistingH1InOriginalSelection = true;
                    break;
                }
            }
            if (preExistingH1InOriginalSelection) {
                promotionsToH1.forEach(t => {
                    issues.push({
                        type: 'promotion_blocked',
                        message: `Cannot promote to H1: An H1 heading already existed within the original selection.`,
                        currentLevel: t.currentLevel,
                        targetLevel: t.targetLevel,
                        lineNumber: t.lineNum + 1
                    });
                });
            }
        }

        // 4. Conditional Block: Demotion H5 to H6 when H6 already in original selection and wrap is disabled
        //    "and h5 cant go to h6 is h6 is already there, when warp after h6 is disabled"
        if (!this.settings.wrapAfterH6) {
            const demotionsH5ToH6 = transformations.filter(t => t.currentLevel === HeadingLevel.H5 && t.targetLevel === HeadingLevel.H6);
            if (demotionsH5ToH6.length > 0) {
                let preExistingH6InOriginalSelection = false;
                for (let i = selectionStartLine; i <= selectionEndLine; i++) {
                    // Check only lines that were NOT part of this H5->H6 demotion attempt
                    const isCurrentlyBeingDemotedH5ToH6 = demotionsH5ToH6.some(d => d.lineNum === i);
                    if (!isCurrentlyBeingDemotedH5ToH6 && getOriginalSelectionLevel(i) === HeadingLevel.H6) {
                        preExistingH6InOriginalSelection = true;
                        break;
                    }
                }
                if (preExistingH6InOriginalSelection) {
                    demotionsH5ToH6.forEach(t => {
                        issues.push({
                            type: 'demotion_blocked',
                            message: `Cannot demote H5 to H6: An H6 already existed in the original selection, and "Wrap after H6" is disabled.`,
                            currentLevel: t.currentLevel,
                            targetLevel: t.targetLevel,
                            lineNumber: t.lineNum + 1
                        });
                    });
                }
            }
        }

        // --- General Warnings (Post-transform state, if not already caught by a more specific block) ---

        // Check if any blocking issues of these types already exist before adding general warnings
        const hasBlockingH1Issue = issues.some(i => i.type === 'promotion_blocked' && i.targetLevel === HeadingLevel.H1);
        const hasBlockingH6Issue = issues.some(i => i.type === 'demotion_blocked' && (i.targetLevel === HeadingLevel.H6 || i.currentLevel === HeadingLevel.H6));

        // General Warning: Selection now contains H1 and H2
        if (!hasBlockingH1Issue && selectionLevelsAfterTransform.has(HeadingLevel.H1) && selectionLevelsAfterTransform.has(HeadingLevel.H2)) {
            const firstH1OrH2Line = transformations.find(t => t.targetLevel === HeadingLevel.H1 || t.targetLevel === HeadingLevel.H2) || transformations[0];
            issues.push({
                type: 'general_warning',
                message: `Warning: The selection now contains both H1 and H2 headings. This might affect document structure.`,
                currentLevel: firstH1OrH2Line?.currentLevel,
                targetLevel: firstH1OrH2Line?.targetLevel,
                lineNumber: firstH1OrH2Line ? firstH1OrH2Line.lineNum + 1 : undefined
            });
        }

        // General Warning: Selection now contains H5 and H6, and wrap is disabled
        if (!hasBlockingH6Issue && !this.settings.wrapAfterH6 && selectionLevelsAfterTransform.has(HeadingLevel.H5) && selectionLevelsAfterTransform.has(HeadingLevel.H6)) {
            const firstH5OrH6Line = transformations.find(t => t.targetLevel === HeadingLevel.H5 || t.targetLevel === HeadingLevel.H6) || transformations[0];
            issues.push({
                type: 'general_warning',
                message: `Warning: Selection now contains H5 and H6 headings, and "Wrap after H6" is disabled. This may lead to H6 dead-ends.`,
                currentLevel: firstH5OrH6Line?.currentLevel,
                targetLevel: firstH5OrH6Line?.targetLevel,
                lineNumber: firstH5OrH6Line ? firstH5OrH6Line.lineNum + 1 : undefined
            });
        }

        // Deduplicate issues based on message and line number
        const uniqueIssues: typeof issues = [];
        const seenIssues = new Set<string>();
        for (const issue of issues) {
            const key = `${issue.lineNumber}-${issue.message}`; // LineNumber might be undefined for some general warnings not tied to a specific line
            if (!seenIssues.has(key) || !issue.lineNumber) { // Allow general warnings not tied to a line to pass if message is unique
                uniqueIssues.push(issue);
                if (issue.lineNumber) seenIssues.add(key); else seenIssues.add(issue.message); // Use message if no line number
            }
        }
        return uniqueIssues;
    }

    /**
     * Get a set of heading levels within a specific line range (AFTER transformations)
     * @param editor The editor instance
     * @param minLine The minimum line number
     * @param maxLine The maximum line number
     * @returns A set of heading levels
     */
    private getHeadingLevelsInRange(editor: Editor, minLine: number, maxLine: number): Set<HeadingLevel> {
        const levels = new Set<HeadingLevel>();

        for (let i = minLine; i <= maxLine; i++) {
            const lineText = editor.getLine(i);
            const parsed = MarkdownParser.parseLine(lineText);
            if (parsed.level !== HeadingLevel.Paragraph) {
                levels.add(parsed.level);
            }
        }

        return levels;
    }

    /**
     * Count headings of specific level within a range, excluding transformation lines
     */
    private countHeadingLevelInRange(
        editor: Editor,
        level: HeadingLevel,
        minLine: number,
        maxLine: number,
        excludeLines: number[] = []
    ): number {
        let count = 0;

        for (let i = minLine; i <= maxLine; i++) {
            if (excludeLines.includes(i)) continue; // excludeLines are 0-based like minLine/maxLine

            const lineText = editor.getLine(i);
            const parsed = MarkdownParser.parseLine(lineText);
            if (parsed.level === level) {
                count++;
            }
        }

        return count;
    }

    /**
     * Get line info for all lines with headings or content
     */
    getLineInfo(editor: Editor): LineInfo[] {
        const lineCount = editor.lineCount();
        const lineInfos: LineInfo[] = [];

        for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
            const text = editor.getLine(lineNumber);
            const parsed = MarkdownParser.parseLine(text);

            // Include lines that have content or are headings
            if (text.trim() !== '' || parsed.level !== HeadingLevel.Paragraph) {
                lineInfos.push({
                    lineNumber: lineNumber + 1, // 1-based line numbers
                    text,
                    headingLevel: parsed.level,
                    indent: parsed.indent,
                    listMarker: parsed.listMarker,
                    headingMarker: parsed.headingMarker,
                    content: parsed.content
                });
            }
        }

        return lineInfos;
    }

    /**
     * Batch operation for multiple lines
     */
    batchTransform(editor: Editor, lineNumbers: number[], targetLevel: HeadingLevel): void {
        // Sort line numbers in descending order to avoid offset issues
        const sortedLines = [...lineNumbers].sort((a, b) => b - a);

        for (const lineNum of sortedLines) {
            this.transformLine(editor, lineNum - 1, targetLevel); // Convert to 0-based
        }
    }

    //TODO: not being used anywhere
    /**
     * Smart heading promotion that respects hierarchy
     * This will promote the heading to the next level
     * @param editor The editor instance
     * @returns void
     */
    smartPromote(editor: Editor): void {
        this.cycleHeading(editor, 'up');
    }

    /**
     * Smart heading demotion that respects hierarchy
     * This will demote the heading to the previous level
     * @param editor The editor instance
     * @returns void
     */
    smartDemote(editor: Editor): void {
        this.cycleHeading(editor, 'down');
    }

    /**
     * Transform a line to a new heading level
     * This will replace the line with the new heading level and the content of the line
     *
     * @param editor The editor instance
     * @param lineNumber The line number to transform
     * @param newLevel The new heading level
     * 
     *
     */
    private transformLine(editor: Editor, lineNumber: number, newLevel: HeadingLevel): void {
        const lineText = editor.getLine(lineNumber);
        const parsed = MarkdownParser.parseLine(lineText);
        const newText = MarkdownParser.lineToText(parsed, newLevel);

        // Replace the line
        const lineStart: EditorPosition = { line: lineNumber, ch: 0 };
        const lineEnd: EditorPosition = { line: lineNumber, ch: lineText.length };

        editor.replaceRange(newText, lineStart, lineEnd);
    }


    /**
     * Apply min/max constraints to a heading level
     * @param level The heading level to constrain
     * @returns The constrained heading level
     */
    private applyLevelConstraints(level: HeadingLevel): HeadingLevel {
        if (level === HeadingLevel.Paragraph) {
            return level; // Paragraph is always allowed
        }

        // Apply min/max constraints
        if (level < this.settings.minLevel) {
            return this.settings.minLevel;
        }

        if (level > this.settings.maxLevel) {
            return this.settings.maxLevel;
        }

        return level;
    }

    /**
     * Get heading level for a specific line
     */
    getHeadingLevel(editor: Editor, lineNumber: number): HeadingLevel {
        const lineText = editor.getLine(lineNumber);
        const parsed = MarkdownParser.parseLine(lineText);
        return parsed.level;
    }
} 