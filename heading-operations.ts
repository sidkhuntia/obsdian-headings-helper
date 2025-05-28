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
        selectionStartLine: number,
        selectionEndLine: number
    ): Promise<void> {
        if (transformations.length === 0) return;

        const originalStates = transformations.map(t => ({
            lineNum: t.lineNum, // 0-indexed
            originalText: editor.getLine(t.lineNum),
            originalLevel: t.currentLevel
        }));

        // Create a map of original heading levels for all lines in the initial selection
        // This map uses 0-indexed line numbers.
        const originalLevelsInSelectionMap = new Map<number, HeadingLevel>();
        for (let i = selectionStartLine; i <= selectionEndLine; i++) {
            const originalTransformedState = originalStates.find(s => s.lineNum === i);
            if (originalTransformedState) {
                originalLevelsInSelectionMap.set(i, originalTransformedState.originalLevel);
            } else {
                // If line was not part of 'transformations', parse its original state
                const lineText = editor.getLine(i); // This is pre-any-transformation for these lines
                const parsed = MarkdownParser.parseLine(lineText);
                originalLevelsInSelectionMap.set(i, parsed.level);
            }
        }

        // Apply all transformations first
        for (const transformation of transformations) {
            this.transformLine(editor, transformation.lineNum, transformation.targetLevel);
        }

        if (this.app && transformations.length > 0) {
            const shouldContinue = await this.checkBatchHierarchy(
                editor,
                transformations,
                originalLevelsInSelectionMap,
                operationType,
                selectionStartLine, // 0-indexed
                selectionEndLine   // 0-indexed
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
        if (!this.settings.checkHierarchy || transformations.length === 0) {
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
        const representativeTransformation = transformations.find(t =>
            (t.currentLevel === primaryIssue.currentLevel && t.targetLevel === primaryIssue.targetLevel) ||
            (t.lineNum + 1 === primaryIssue.lineNumber)
        ) || transformations[0];


        const warningDetails = {
            type: primaryIssue.type,
            currentLevel: representativeTransformation.currentLevel,
            targetLevel: representativeTransformation.targetLevel,
            lineNumber: representativeTransformation.lineNum + 1,
            message: primaryIssue.message
        };

        
        new Notice(warningDetails.message, 5000);

        if (operationType === 'set') {
            return true; // For "direct set", always allow after warning.
        }

        const isBlockingWarning = warningDetails.type === 'hierarchy_break' ||
            warningDetails.type === 'demotion_blocked' ||
            warningDetails.type === 'promotion_blocked';

        if (isBlockingWarning && !this.settings.allowHierarchyOverride) {
            return false;
        }

        return true;
    }

    /**
     * Analyze batch transformation for hierarchy issues
     */
    private analyzeBatchTransformation(
        editor: Editor,
        transformations: { lineNum: number; currentLevel: HeadingLevel; targetLevel: HeadingLevel; }[],
        originalLevelsInSelectionMap: Map<number, HeadingLevel>, // 0-indexed lineNum -> original HeadingLevel
        selectionStartLine: number, // 0-indexed
        selectionEndLine: number   // 0-indexed
    ): { type: string; message: string; currentLevel: HeadingLevel; targetLevel: HeadingLevel; lineNumber: number }[] {
        const issues: { type: string; message: string; currentLevel: HeadingLevel; targetLevel: HeadingLevel; lineNumber: number }[] = [];
        if (transformations.length === 0) return issues;

        // Helper to get original level of a line in the initial selection
        const getOriginalSelectionLevel = (lineNum: number): HeadingLevel => { // lineNum is 0-indexed
            return originalLevelsInSelectionMap.get(lineNum) || HeadingLevel.Paragraph;
        };

        // Get heading levels in the transformed range *after* transformations are applied
        // These are 0-indexed
        const minTransformedLineNum = Math.min(...transformations.map(t => t.lineNum));
        const maxTransformedLineNum = Math.max(...transformations.map(t => t.lineNum));
        const selectionLevelsAfterTransform = this.getHeadingLevelsInRange(editor, minTransformedLineNum, maxTransformedLineNum);


        // --- Start of refined checks ---

        // Rule 1: Critical - H6 to Paragraph violation (Demotion Block)
        const h6ToParaTransformations = transformations.filter(t =>
            t.currentLevel === HeadingLevel.H6 && t.targetLevel === HeadingLevel.Paragraph
        );
        if (h6ToParaTransformations.length > 0 && !this.settings.wrapAfterH6) {
            h6ToParaTransformations.forEach(t => {
                issues.push({
                    type: 'demotion_blocked',
                    message: `Cannot demote H6 to Paragraph: "Wrap after H6" is disabled.`,
                    currentLevel: t.currentLevel,
                    targetLevel: t.targetLevel,
                    lineNumber: t.lineNum + 1
                });
            });
        }

        // Rule 2: Critical - Higher level to Paragraph orphaning lower levels (Hierarchy Break)
        const higherLevelToParaTransformations = transformations.filter(t =>
            t.targetLevel === HeadingLevel.Paragraph &&
            t.currentLevel >= HeadingLevel.H1 && t.currentLevel <= HeadingLevel.H5
        );
        if (higherLevelToParaTransformations.length > 0) {
            higherLevelToParaTransformations.forEach(t => {
                const minOriginalLevelMadePara = t.currentLevel;
                for (let orphanedLevelCandidate = minOriginalLevelMadePara + 1; orphanedLevelCandidate <= HeadingLevel.H6; orphanedLevelCandidate++) {
                    if (selectionLevelsAfterTransform.has(orphanedLevelCandidate as HeadingLevel)) {
                        // Check if this orphaned candidate is actually within the selection range
                        let presentInSelection = false;
                        for (let lineIdx = selectionStartLine; lineIdx <= selectionEndLine; lineIdx++) {
                            if (MarkdownParser.parseLine(editor.getLine(lineIdx)).level === orphanedLevelCandidate) {
                                presentInSelection = true;
                                break;
                            }
                        }
                        if (presentInSelection) {
                            issues.push({
                                type: 'hierarchy_break',
                                message: `Converting H${minOriginalLevelMadePara} to Paragraph may orphan H${orphanedLevelCandidate} headings within the selection.`,
                                currentLevel: t.currentLevel,
                                targetLevel: t.targetLevel,
                                lineNumber: t.lineNum + 1
                            });
                            break; // Found an orphan for this transformation, move to next
                        }
                    }
                }
            });
        }

        // User Rule 3: Promotion Block - "h2 cant go to h1 if h1 is already there in selection"
        const promotionsToH1 = transformations.filter(t => t.targetLevel === HeadingLevel.H1 && t.currentLevel > HeadingLevel.H1);
        if (promotionsToH1.length > 0) {
            let preExistingH1InOriginalSelection = false;
            for (let i = selectionStartLine; i <= selectionEndLine; i++) {
                if (getOriginalSelectionLevel(i) === HeadingLevel.H1) {
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

        // User Rule 4: Demotion Block - "h5 cant go to h6 if h6 is already there, when warp after h6 is disabled"
        if (!this.settings.wrapAfterH6) {
            const demotionsToH6FromH5 = transformations.filter(t => t.currentLevel === HeadingLevel.H5 && t.targetLevel === HeadingLevel.H6);
            if (demotionsToH6FromH5.length > 0) {
                let preExistingH6InOriginalSelection = false;
                for (let i = selectionStartLine; i <= selectionEndLine; i++) {
                    if (getOriginalSelectionLevel(i) === HeadingLevel.H6) {
                        preExistingH6InOriginalSelection = true;
                        break;
                    }
                }
                if (preExistingH6InOriginalSelection) {
                    demotionsToH6FromH5.forEach(t => {
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

        // General Warning: Selection has H1 and H2 after transform (if not already blocked by H1 promotion)
        const finalSelectionHasH1 = selectionLevelsAfterTransform.has(HeadingLevel.H1);
        const finalSelectionHasH2 = selectionLevelsAfterTransform.has(HeadingLevel.H2);
        if (finalSelectionHasH1 && finalSelectionHasH2) {
            const isAlreadyBlockedForH1Promotion = issues.some(i => i.type === 'promotion_blocked' && i.message.includes("Cannot promote to H1"));
            if (!isAlreadyBlockedForH1Promotion) {
                // Find a representative transformation or a line that is H1/H2
                const repTrans = transformations.find(t => t.targetLevel === HeadingLevel.H1 || t.targetLevel === HeadingLevel.H2) || transformations[0];
                issues.push({
                    type: 'general_warning',
                    message: `Warning: The selection now contains both H1 and H2 headings. This might affect document structure.`,
                    currentLevel: repTrans.currentLevel,
                    targetLevel: repTrans.targetLevel,
                    lineNumber: repTrans.lineNum + 1
                });
            }
        }

        // General Warning: Selection has H5 and H6 after transform, and wrap is disabled (if not already blocked)
        const finalSelectionHasH5 = selectionLevelsAfterTransform.has(HeadingLevel.H5);
        const finalSelectionHasH6 = selectionLevelsAfterTransform.has(HeadingLevel.H6);
        if (finalSelectionHasH5 && finalSelectionHasH6 && !this.settings.wrapAfterH6) {
            const isAlreadyBlocked = issues.some(i =>
                (i.type === 'demotion_blocked' && (i.message.includes("Cannot demote H5 to H6") || i.message.includes("Cannot demote H6 to Paragraph")))
            );
            if (!isAlreadyBlocked) {
                const repTrans = transformations.find(t => t.targetLevel === HeadingLevel.H5 || t.targetLevel === HeadingLevel.H6) || transformations[0];
                issues.push({
                    type: 'general_warning',
                    message: `Warning: Selection contains H5 and H6 headings, and "Wrap after H6" is disabled. This may lead to H6 dead-ends.`,
                    currentLevel: repTrans.currentLevel,
                    targetLevel: repTrans.targetLevel,
                    lineNumber: repTrans.lineNum + 1
                });
            }
        }

        // Deduplicate issues based on message and line number to avoid spamming notices for very similar issues from different rules
        const uniqueIssues: typeof issues = [];
        const seenIssues = new Set<string>();
        for (const issue of issues) {
            const key = `${issue.lineNumber}-${issue.message}`;
            if (!seenIssues.has(key)) {
                uniqueIssues.push(issue);
                seenIssues.add(key);
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