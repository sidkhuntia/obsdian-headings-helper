import { Editor, Notice, App } from 'obsidian';
import { HeadingLevel, HeadingHelperSettings } from './types';
import { MarkdownParser } from './parser';

export interface HierarchyWarning {
    type: 'promotion_blocked' | 'demotion_blocked' | 'hierarchy_break' | 'general_warning';
    currentLevel: HeadingLevel;
    targetLevel: HeadingLevel;
    message: string;
    lineNumber: number;
}

export class HierarchyChecker {
    private lastWarningTime = 0;
    private lastWarningType = '';
    private readonly DEBOUNCE_TIME = 1500;

    constructor(private settings: HeadingHelperSettings) { }

    async checkAndWarnHierarchy(
        app: App,
        editor: Editor,
        currentLevel: HeadingLevel,
        targetLevel: HeadingLevel,
        lineNumber: number,
        operation: () => void
    ): Promise<void> {
        if (!this.settings.checkHierarchy) {
            operation();
            return;
        }

        const warning = this.checkHierarchy(editor, currentLevel, targetLevel, lineNumber);
        if (!warning) {
            operation();
            return;
        }

        if (this.isRecentDuplicate(warning, lineNumber)) {
            if (this.shouldBlockOperation(warning.type)) {
                return;
            }
            operation();
            return;
        }

        this.updateLastWarning(warning, lineNumber);
        new Notice(warning.message, 5000);

        if (this.shouldBlockOperation(warning.type)) {
            return;
        }

        operation();
    }

    private isRecentDuplicate(warning: HierarchyWarning, lineNumber: number): boolean {
        const now = Date.now();
        const warningKey = `${warning.type}-${warning.currentLevel}-${warning.targetLevel}-${lineNumber}`;
        return now - this.lastWarningTime < this.DEBOUNCE_TIME && this.lastWarningType === warningKey;
    }

    private updateLastWarning(warning: HierarchyWarning, lineNumber: number): void {
        this.lastWarningTime = Date.now();
        this.lastWarningType = `${warning.type}-${warning.currentLevel}-${warning.targetLevel}-${lineNumber}`;
    }

    private shouldBlockOperation(warningType: string): boolean {
        const blockingTypes = ['hierarchy_break', 'demotion_blocked', 'promotion_blocked'];
        return blockingTypes.includes(warningType) && !this.settings.allowHierarchyOverride;
    }

    private getHeadingLinesFromSelection(editor: Editor, excludeLineNumber?: number): { level: HeadingLevel; lineNumber: number }[] {
        const selections = editor.listSelections();
        const selectedLines: { level: HeadingLevel; lineNumber: number }[] = [];

        if (selections.length === 0) return selectedLines;

        const selection = selections[0];
        const startLine = Math.min(selection.anchor.line, selection.head.line);
        const endLine = Math.max(selection.anchor.line, selection.head.line);

        for (let i = startLine; i <= endLine; i++) {
            if (excludeLineNumber !== undefined && i === excludeLineNumber - 1) {
                continue;
            }

            const lineText = editor.getLine(i);
            const parsed = MarkdownParser.parseLine(lineText);

            if (parsed?.level !== HeadingLevel.Paragraph) {
                selectedLines.push({ level: parsed.level, lineNumber: i + 1 });
            }
        }

        return selectedLines;
    }

    private checkHierarchy(
        editor: Editor,
        currentLevel: HeadingLevel,
        targetLevel: HeadingLevel,
        lineNumber: number
    ): HierarchyWarning | null {
        if (currentLevel === targetLevel) return null;

        const isPromotion = targetLevel < currentLevel;
        const isDemotion = targetLevel > currentLevel;
        const allOriginalLevels = this.getHeadingLinesFromSelection(editor);
        const otherExistingLevels = this.getHeadingLinesFromSelection(editor, lineNumber);
        const allOriginalLevelsSet = this.getLevelsSet(allOriginalLevels);
        const otherExistingLevelsSet = this.getLevelsSet(otherExistingLevels);

        if (isPromotion) {
            return this.checkPromotionRules(currentLevel, targetLevel, lineNumber, otherExistingLevelsSet);
        }

        if (isDemotion) {
            return this.checkDemotionRules(currentLevel, targetLevel, lineNumber, allOriginalLevelsSet);
        }

        return null;
    }

    private checkPromotionRules(
        currentLevel: HeadingLevel,
        targetLevel: HeadingLevel,
        lineNumber: number,
        otherExistingLevelsSet: Set<HeadingLevel>
    ): HierarchyWarning | null {
        // Prevent promoting to H1 if H1 already exists elsewhere
        if (targetLevel === HeadingLevel.H1 && currentLevel !== HeadingLevel.H1 && otherExistingLevelsSet.has(HeadingLevel.H1)) {
            return {
                type: 'hierarchy_break',
                currentLevel,
                targetLevel,
                lineNumber,
                message: 'Warning: The current selection contains both H1 and H2 headings. Promoting headings within this selection might affect overall document structure. Please review.'
            };
        }

        return null;
    }

    private checkDemotionRules(
        currentLevel: HeadingLevel,
        targetLevel: HeadingLevel,
        lineNumber: number,
        allOriginalLevelsSet: Set<HeadingLevel>
    ): HierarchyWarning | null {
        // H5 to H6 demotion rule
        if (currentLevel === HeadingLevel.H5 && targetLevel === HeadingLevel.H6 && !this.settings.wrapAfterH6 && allOriginalLevelsSet.has(HeadingLevel.H6)) {
            return {
                type: 'demotion_blocked',
                currentLevel,
                targetLevel,
                lineNumber,
                message: 'Demoting H5 to H6: "Wrap after H6" is disabled, and both H5 and H6 levels exist globally. This can create a dead-end. Consider enabling "Wrap after H6".'
            };
        }

        // H6 demotion reminder when wrap is enabled
        if (this.settings.wrapAfterH6 && currentLevel === HeadingLevel.H6) {
            return {
                type: 'general_warning',
                currentLevel,
                targetLevel,
                lineNumber,
                message: 'Reminder: "Wrap after H6" is enabled. Repeatedly demoting H6 will eventually convert them to Paragraphs. The document contains both H5 and H6 levels.'
            };
        }

        // Prevent H6 to Paragraph when wrap is disabled
        if (currentLevel === HeadingLevel.H6 && targetLevel === HeadingLevel.Paragraph && !this.settings.wrapAfterH6) {
            return {
                type: 'demotion_blocked',
                currentLevel,
                targetLevel: HeadingLevel.H6,
                lineNumber,
                message: 'Cannot demote H6 to Paragraph: "Wrap after H6" is disabled. Enable this setting to allow conversion to Paragraph.'
            };
        }

        // Paragraph cascade rule
        if (this.settings.wrapAfterH6 &&
            targetLevel === HeadingLevel.Paragraph &&
            currentLevel >= HeadingLevel.H1 &&
            currentLevel <= HeadingLevel.H5 &&
            allOriginalLevelsSet.has(HeadingLevel.H6)) {
            return {
                type: 'hierarchy_break',
                currentLevel,
                targetLevel,
                lineNumber,
                message: `Converting ${this.levelToString(currentLevel)} to Paragraph might orphan existing lower-level headings (e.g., ${this.levelToString((currentLevel + 1) as HeadingLevel)}). Review structure.`
            };
        }

        return null;
    }

    private getLevelsSet(headingLines: { level: HeadingLevel; lineNumber: number }[]): Set<HeadingLevel> {
        return new Set(headingLines.map(line => line.level));
    }

    private levelToString(level: HeadingLevel): string {
        return level === HeadingLevel.Paragraph ? 'Paragraph' : `H${level}`;
    }
}