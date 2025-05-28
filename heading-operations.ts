import { Editor, EditorPosition, EditorSelection, App, Notice } from 'obsidian';
import { HeadingLevel, HeadingHelperSettings, LineInfo } from './types';
import { MarkdownParser } from './parser';
import { HierarchyChecker } from './hierarchy-checker';

interface TransformationRequest {
    lineNum: number;
    currentLevel: HeadingLevel;
    targetLevel: HeadingLevel;
}

interface HierarchyIssue {
    type: string;
    message: string;
    currentLevel?: HeadingLevel;
    targetLevel?: HeadingLevel;
    lineNumber?: number;
}

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
        for (const selection of selections) {
            await this.processSelection(editor, selection, direction);
        }
    }

    /**
     * Set specific heading level for current line or selection - only works with headings
     */
    async setHeadingLevel(editor: Editor, targetLevel: HeadingLevel, lineNumber?: number): Promise<void> {
        if (lineNumber !== undefined) {
            await this.setSpecificLine(editor, targetLevel, lineNumber);
        } else {
            const selections = editor.listSelections();
            for (const selection of selections) {
                await this.processSelectionWithLevel(editor, selection, targetLevel);
            }
        }
    }

    private async setSpecificLine(editor: Editor, targetLevel: HeadingLevel, lineNumber: number): Promise<void> {
        const lineText = editor.getLine(lineNumber - 1);
        const parsed = MarkdownParser.parseLine(lineText);
        const isHeading = parsed.level !== HeadingLevel.Paragraph;
        const isH6ToParagraph = (targetLevel === HeadingLevel.Paragraph && parsed.level === HeadingLevel.H6);

        if (isHeading || isH6ToParagraph) {
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
                this.transformLine(editor, lineNumber - 1, targetLevel);
            }
        }
    }

    private async processSelection(editor: Editor, selection: EditorSelection, direction: 'up' | 'down' | 'cycle'): Promise<void> {
        const { anchor, head } = selection;
        const startLine = Math.min(anchor.line, head.line);
        const endLine = Math.max(anchor.line, head.line);

        const transformations: TransformationRequest[] = [];

        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const lineText = editor.getLine(lineNum);
            const parsed = MarkdownParser.parseLine(lineText);

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

        await this.executeBatchTransformation(editor, transformations, direction, startLine, endLine);
    }

    private async processSelectionWithLevel(editor: Editor, selection: EditorSelection, targetLevel: HeadingLevel): Promise<void> {
        const { anchor, head } = selection;
        const startLine = Math.min(anchor.line, head.line);
        const endLine = Math.max(anchor.line, head.line);

        const transformations: TransformationRequest[] = [];

        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const lineText = editor.getLine(lineNum);
            const parsed = MarkdownParser.parseLine(lineText);

            const isHeading = parsed.level !== HeadingLevel.Paragraph;
            const isH6ToParagraph = (targetLevel === HeadingLevel.Paragraph && parsed.level === HeadingLevel.H6);

            if ((isHeading || isH6ToParagraph) && parsed.level !== targetLevel) {
                transformations.push({
                    lineNum,
                    currentLevel: parsed.level,
                    targetLevel: targetLevel
                });
            }
        }

        await this.executeBatchTransformation(editor, transformations, 'set', startLine, endLine);
    }

    /**
     * Execute batch transformation: apply all changes first, then check hierarchy once
     */
    private async executeBatchTransformation(
        editor: Editor,
        transformations: TransformationRequest[],
        operationType: 'up' | 'down' | 'cycle' | 'set',
        selectionStartLine: number,
        selectionEndLine: number
    ): Promise<void> {
        if (transformations.length === 0) return;

        const originalStates = transformations.map(t => ({
            lineNum: t.lineNum,
            originalText: editor.getLine(t.lineNum),
            originalLevel: t.currentLevel
        }));

        const originalLevelsMap = this.buildOriginalLevelsMap(editor, selectionStartLine, selectionEndLine, originalStates);

        // Apply all transformations
        for (const transformation of transformations) {
            this.transformLine(editor, transformation.lineNum, transformation.targetLevel);
        }

        // Check hierarchy if enabled
        if (this.app && transformations.length > 0 && this.settings.checkHierarchy) {
            const shouldContinue = await this.checkBatchHierarchy(
                editor,
                transformations,
                originalLevelsMap,
                operationType,
                selectionStartLine,
                selectionEndLine
            );

            if (!shouldContinue) {
                // Revert all changes
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

    private buildOriginalLevelsMap(
        editor: Editor,
        selectionStartLine: number,
        selectionEndLine: number,
        originalStates: { lineNum: number; originalText: string; originalLevel: HeadingLevel; }[]
    ): Map<number, HeadingLevel> {
        const originalLevelsMap = new Map<number, HeadingLevel>();

        for (let i = selectionStartLine; i <= selectionEndLine; i++) {
            const transformedState = originalStates.find(s => s.lineNum === i);

            if (transformedState) {
                originalLevelsMap.set(i, transformedState.originalLevel);
            } else {
                const lineText = editor.getLine(i);
                const parsed = MarkdownParser.parseLine(lineText);
                originalLevelsMap.set(i, parsed.level);
            }
        }

        return originalLevelsMap;
    }

    /**
     * Check hierarchy for batch operations - returns false if operation should be blocked
     */
    private async checkBatchHierarchy(
        editor: Editor,
        transformations: TransformationRequest[],
        originalLevelsInSelectionMap: Map<number, HeadingLevel>,
        operationType: 'up' | 'down' | 'cycle' | 'set',
        selectionStartLine: number,
        selectionEndLine: number
    ): Promise<boolean> {
        const batchIssues = this.analyzeBatchTransformation(
            editor,
            transformations,
            originalLevelsInSelectionMap,
            selectionStartLine,
            selectionEndLine
        );

        if (batchIssues.length === 0) return true;

        const primaryIssue = batchIssues[0];
        const representativeTransformation = this.findRepresentativeTransformation(transformations, primaryIssue);

        const warningDetails = this.buildWarningDetails(primaryIssue, representativeTransformation);

        new Notice(warningDetails.message, 5000);

        // Allow 'set' operations after warning
        if (operationType === 'set') return true;

        const isBlockingWarning = ['hierarchy_break', 'demotion_blocked', 'promotion_blocked'].includes(warningDetails.type);
        return !isBlockingWarning || this.settings.allowHierarchyOverride;
    }

    private findRepresentativeTransformation(transformations: TransformationRequest[], issue: HierarchyIssue): TransformationRequest {
        return transformations.find(t => t.lineNum === (issue.lineNumber ? issue.lineNumber - 1 : -1)) ||
            transformations.find(t => t.currentLevel === issue.currentLevel && t.targetLevel === issue.targetLevel) ||
            transformations[0];
    }

    private buildWarningDetails(issue: HierarchyIssue, transformation: TransformationRequest) {
        return {
            type: issue.type,
            currentLevel: issue.currentLevel ?? transformation.currentLevel,
            targetLevel: issue.targetLevel ?? transformation.targetLevel,
            lineNumber: issue.lineNumber ?? (transformation ? transformation.lineNum + 1 : 0),
            message: issue.message
        };
    }

    /**
     * Analyze batch transformation for hierarchy issues
     */
    private analyzeBatchTransformation(
        editor: Editor,
        transformations: TransformationRequest[],
        originalLevelsInSelectionMap: Map<number, HeadingLevel>,
        selectionStartLine: number,
        selectionEndLine: number
    ): HierarchyIssue[] {
        const issues: HierarchyIssue[] = [];
        if (transformations.length === 0) return issues;

        const minTransformedLineNum = Math.min(...transformations.map(t => t.lineNum));
        const maxTransformedLineNum = Math.max(...transformations.map(t => t.lineNum));
        const selectionLevelsAfterTransform = this.getHeadingLevelsInRange(editor, minTransformedLineNum, maxTransformedLineNum);

        // Check critical blocks
        this.checkCriticalBlocks(transformations, originalLevelsInSelectionMap, selectionStartLine, selectionEndLine, issues);

        // Check general warnings
        this.checkGeneralWarnings(transformations, selectionLevelsAfterTransform, issues);

        return this.deduplicateIssues(issues);
    }

    private checkCriticalBlocks(
        transformations: TransformationRequest[],
        originalLevelsInSelectionMap: Map<number, HeadingLevel>,
        selectionStartLine: number,
        selectionEndLine: number,
        issues: HierarchyIssue[]
    ): void {
        // H6 to Paragraph violation
        transformations.forEach(t => {
            if (t.currentLevel === HeadingLevel.H6 && t.targetLevel === HeadingLevel.Paragraph && !this.settings.wrapAfterH6) {
                issues.push({
                    type: 'demotion_blocked',
                    message: 'Cannot demote H6 to Paragraph: "Wrap after H6" is disabled.',
                    currentLevel: t.currentLevel,
                    targetLevel: t.targetLevel,
                    lineNumber: t.lineNum + 1
                });
            }
        });

        // Promotion to H1 when H1 exists in original selection
        const promotionsToH1 = transformations.filter(t => t.targetLevel === HeadingLevel.H1 && t.currentLevel > HeadingLevel.H1);
        if (promotionsToH1.length > 0) {
            let preExistingH1 = false;
            for (let i = selectionStartLine; i <= selectionEndLine; i++) {
                const isBeingPromotedToH1 = promotionsToH1.some(p => p.lineNum === i);
                if (!isBeingPromotedToH1 && originalLevelsInSelectionMap.get(i) === HeadingLevel.H1) {
                    preExistingH1 = true;
                    break;
                }
            }
            if (preExistingH1) {
                promotionsToH1.forEach(t => {
                    issues.push({
                        type: 'promotion_blocked',
                        message: 'Cannot promote to H1: An H1 heading already existed within the original selection.',
                        currentLevel: t.currentLevel,
                        targetLevel: t.targetLevel,
                        lineNumber: t.lineNum + 1
                    });
                });
            }
        }

        // H5 to H6 demotion when H6 exists and wrap disabled
        if (!this.settings.wrapAfterH6) {
            const demotionsH5ToH6 = transformations.filter(t => t.currentLevel === HeadingLevel.H5 && t.targetLevel === HeadingLevel.H6);
            if (demotionsH5ToH6.length > 0) {
                let preExistingH6 = false;
                for (let i = selectionStartLine; i <= selectionEndLine; i++) {
                    const isBeingDemotedH5ToH6 = demotionsH5ToH6.some(d => d.lineNum === i);
                    if (!isBeingDemotedH5ToH6 && originalLevelsInSelectionMap.get(i) === HeadingLevel.H6) {
                        preExistingH6 = true;
                        break;
                    }
                }
                if (preExistingH6) {
                    demotionsH5ToH6.forEach(t => {
                        issues.push({
                            type: 'demotion_blocked',
                            message: 'Cannot demote H5 to H6: An H6 already existed in the original selection, and "Wrap after H6" is disabled.',
                            currentLevel: t.currentLevel,
                            targetLevel: t.targetLevel,
                            lineNumber: t.lineNum + 1
                        });
                    });
                }
            }
        }
    }

    private checkGeneralWarnings(
        transformations: TransformationRequest[],
        selectionLevelsAfterTransform: Set<HeadingLevel>,
        issues: HierarchyIssue[]
    ): void {
        const hasBlockingH1Issue = issues.some(i => i.type === 'promotion_blocked' && i.targetLevel === HeadingLevel.H1);
        const hasBlockingH6Issue = issues.some(i => i.type === 'demotion_blocked' &&
            (i.targetLevel === HeadingLevel.H6 || i.currentLevel === HeadingLevel.H6));

        // General warning: Selection contains H1 and H2
        if (!hasBlockingH1Issue && selectionLevelsAfterTransform.has(HeadingLevel.H1) && selectionLevelsAfterTransform.has(HeadingLevel.H2)) {
            const firstH1OrH2Line = transformations.find(t => t.targetLevel === HeadingLevel.H1 || t.targetLevel === HeadingLevel.H2) || transformations[0];
            issues.push({
                type: 'general_warning',
                message: 'Warning: The selection now contains both H1 and H2 headings. This might affect document structure.',
                currentLevel: firstH1OrH2Line?.currentLevel,
                targetLevel: firstH1OrH2Line?.targetLevel,
                lineNumber: firstH1OrH2Line ? firstH1OrH2Line.lineNum + 1 : undefined
            });
        }

        // General warning: Selection contains H5 and H6 with wrap disabled
        if (!hasBlockingH6Issue && !this.settings.wrapAfterH6 &&
            selectionLevelsAfterTransform.has(HeadingLevel.H5) && selectionLevelsAfterTransform.has(HeadingLevel.H6)) {
            const firstH5OrH6Line = transformations.find(t => t.targetLevel === HeadingLevel.H5 || t.targetLevel === HeadingLevel.H6) || transformations[0];
            issues.push({
                type: 'general_warning',
                message: 'Warning: Selection now contains H5 and H6 headings, and "Wrap after H6" is disabled. This may lead to H6 dead-ends.',
                currentLevel: firstH5OrH6Line?.currentLevel,
                targetLevel: firstH5OrH6Line?.targetLevel,
                lineNumber: firstH5OrH6Line ? firstH5OrH6Line.lineNum + 1 : undefined
            });
        }
    }

    private deduplicateIssues(issues: HierarchyIssue[]): HierarchyIssue[] {
        const uniqueIssues: HierarchyIssue[] = [];
        const seenIssues = new Set<string>();

        for (const issue of issues) {
            const key = issue.lineNumber ? `${issue.lineNumber}-${issue.message}` : issue.message;
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