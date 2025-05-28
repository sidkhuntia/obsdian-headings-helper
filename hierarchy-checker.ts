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

    constructor(private settings: HeadingHelperSettings) { }

    /**
     * Check if an operation would break hierarchy and show warnings (only one per operation, using Notices).
     */
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

        const now = Date.now();
        const warningKey = `${warning.type}-${currentLevel}-${targetLevel}-${lineNumber}`;

        if (now - this.lastWarningTime < 1500 && this.lastWarningType === warningKey) {
            if ((warning.type === 'hierarchy_break' || warning.type === 'demotion_blocked' || warning.type === 'promotion_blocked') && !this.settings.allowHierarchyOverride) {
                return;
            }
            operation();
            return;
        }

        this.lastWarningTime = now;
        this.lastWarningType = warningKey;

        // display the notice for 5 seconds
        new Notice(warning.message, 5000);

        if ((warning.type === 'hierarchy_break' || warning.type === 'demotion_blocked' || warning.type === 'promotion_blocked') && !this.settings.allowHierarchyOverride) {
            return;
        }

        operation();
    }

    /**
     * Get all headings levels and line numbers from the current editor selection.
     * @param editor The editor instance.
     * @param excludeLineNumber Optional 1-based line number to exclude from the scan (e.g., the line being modified).
     */
    private getHeadingLinesFromSelection(editor: Editor, excludeLineNumber?: number): { level: HeadingLevel; lineNumber: number }[] {
        const selections = editor.listSelections();
        const selectedLines: { level: HeadingLevel; lineNumber: number }[] = [];
        // --------------------------------------------------------------------------------------------
        // | @anchor - the point (line and character) where the selection starts                      |
        // | @head - the point (line and character) where the selection ends                          |
        // --------------------------------------------------------------------------------------------
        if (selections.length > 0) {
            // For simplicity, this implementation focuses on the primary selection
            // And considers lines touched by the selection range.
            // A more complex implementation might iterate all selections.
            const selection = selections[0];
            const from = selection.anchor.line < selection.head.line ? selection.anchor : selection.head;
            const to = selection.anchor.line < selection.head.line ? selection.head : selection.anchor;

            for (let i = from.line; i <= to.line; i++) {
                if (excludeLineNumber !== undefined && i === excludeLineNumber - 1) {
                    continue;
                }
                const lineText = editor.getLine(i);
                const parsed = MarkdownParser.parseLine(lineText);
                if (parsed && parsed.level !== HeadingLevel.Paragraph) {
                    // FIXME: not sure why the line number is 1-based
                    selectedLines.push({ level: parsed.level, lineNumber: i + 1 });
                }
            }
        }
        return selectedLines;
    }

    /**
     * Check for hierarchy violations based on defined rules.
     */
    private checkHierarchy(
        editor: Editor,
        currentLevel: HeadingLevel,
        targetLevel: HeadingLevel,
        lineNumber: number // 1-based line number of the line being modified
    ): HierarchyWarning | null {
        if (currentLevel === targetLevel) return null; // No change, no warning

        const isPromotion = targetLevel < currentLevel;
        const isDemotion = targetLevel > currentLevel;
        const allOriginalLevels = this.getHeadingLinesFromSelection(editor); // All headings in the selected lines before this change
        const otherExistingLevels = this.getHeadingLinesFromSelection(editor, lineNumber); // Headings excluding the current line
        const allOriginalLevelsSet = this.getHeadingLevelsFromSelection(allOriginalLevels);
        const otherExistingLevelsSet = this.getHeadingLevelsFromSelection(otherExistingLevels);

        //FIXME: this should check in the selected lines, not the whole document
        // --- CRITICAL PROMOTION RULE --- 
        // Rule 1: Prevent promoting *any* heading to H1 if an H1 already exists elsewhere.
        if (isPromotion && targetLevel === HeadingLevel.H1 && currentLevel !== HeadingLevel.H1) {
            if (otherExistingLevelsSet.has(HeadingLevel.H1)) {
                return {
                    type: 'hierarchy_break',
                    currentLevel,
                    targetLevel,
                    lineNumber,
                    message: `Warning: The current selection contains both H1 and H2 headings. Promoting headings within this selection might affect overall document structure. Please review. `,
                };
            }
        }

        // // --- USER'S PROMOTION RULE ---
        // // "if SELECTED text has both h1 and h2 then it should warn the user"
        // if (isPromotion) {
        //     const selectedHasH1 = allOriginalLevelsSet.has(HeadingLevel.H1);
        //     //FIXME: i think we dont need to check for H2 in the selected lines
        //     const selectedHasH2 = allOriginalLevelsSet.has(HeadingLevel.H2);
        //     if (selectedHasH1 && selectedHasH2) {
        //         // Avoid this if the critical H1 duplicate rule already triggered for the current line
        //         const alreadyBlockedByH1Duplicate = (targetLevel === HeadingLevel.H1 && currentLevel !== HeadingLevel.H1 && otherExistingLevelsSet.has(HeadingLevel.H1));
        //         if (!alreadyBlockedByH1Duplicate) {
        //             return {
        //                 type: 'general_warning',
        //                 currentLevel,
        //                 targetLevel,
        //                 lineNumber,
        //                 message: `Warning: The current selection contains both H1 and H2 headings. Promoting headings within this selection might affect overall document structure. Please review. `,
        //             };
        //         }
        //     }
        // }

        // --- DEMOTION RULES ---
        if (isDemotion) {
            // User's Demotion Rule 1: "if the we have both h5 and h6 and h6->paragraph is disabled then it should warn the user"
            // This applies when the *line being modified* is H5, target is H6, and globally H5/H6 exist and wrap is off.
            if (currentLevel === HeadingLevel.H5 && targetLevel === HeadingLevel.H6 && !this.settings.wrapAfterH6) {
                if (allOriginalLevelsSet.has(HeadingLevel.H6)) {
                    return {
                        type: 'demotion_blocked', // User implies this should be a blocking warning
                        currentLevel,
                        targetLevel,
                        lineNumber,
                        message: `Demoting H5 to H6: "Wrap after H6" is disabled, and both H5 and H6 levels exist globally. This can create a dead-end. Consider enabling "Wrap after H6".`,
                    };
                }
            }

            // User's Demotion Rule 2: "if h6->para is allowed and we have h5 and h6 then warn doing the demotion multiple times will result in everything being para"
            // This applies if the current line is H5 or H6, wrap is ON, and globally H5/H6 exist.
            if (this.settings.wrapAfterH6 && (currentLevel === HeadingLevel.H6)) {

                return {
                    type: 'general_warning',
                    currentLevel,
                    targetLevel,
                    lineNumber,
                    message: `Reminder: "Wrap after H6" is enabled. Repeatedly demoting H6 will eventually convert them to Paragraphs. The document contains both H5 and H6 levels.`,
                };
            }

            // Critical H6 Demotion Rule: Prevent H6 becoming Paragraph if wrapAfterH6 is OFF.
            if (currentLevel === HeadingLevel.H6 && targetLevel === HeadingLevel.Paragraph && !this.settings.wrapAfterH6) {
                return {
                    type: 'demotion_blocked',
                    currentLevel,
                    targetLevel: HeadingLevel.H6, // Effectively, it should remain H6
                    lineNumber,
                    message: `Cannot demote H6 to Paragraph: "Wrap after H6" is disabled. Enable this setting to allow conversion to Paragraph.`,
                };
            }

            // Paragraph Cascade Rule: Demoting H1-H5 to Paragraph with wrapAfterH6 ON
            if (this.settings.wrapAfterH6 && targetLevel === HeadingLevel.Paragraph && currentLevel >= HeadingLevel.H1 && currentLevel <= HeadingLevel.H5) {
                const hasLowerOrphaned = allOriginalLevelsSet.has(HeadingLevel.H6);
                if (hasLowerOrphaned) {
                    return {
                        type: 'hierarchy_break',
                        currentLevel,
                        targetLevel,
                        lineNumber,
                        message: `Converting ${this.levelToString(currentLevel)} to Paragraph might orphan existing lower-level headings (e.g., ${this.levelToString(currentLevel + 1 as HeadingLevel)}). Review structure.`,
                    };
                }
            }
        }

        return null; // No hierarchy issues detected by these rules
    }

    /**
     * Get all existing heading levels in the document.
     * @param editor The editor instance.
     * @param excludeLineNumber Optional 1-based line number to exclude from the scan (e.g., the line being modified).
     */
    private getExistingHeadingLevels(editor: Editor, excludeLineNumber?: number): Set<HeadingLevel> {
        const levels = new Set<HeadingLevel>();
        const lineCount = editor.lineCount();

        for (let i = 0; i < lineCount; i++) {
            if (excludeLineNumber !== undefined && i === excludeLineNumber - 1) { // excludeLineNumber is 1-based
                continue;
            }
            const lineText = editor.getLine(i);
            const parsed = MarkdownParser.parseLine(lineText);
            if (parsed && parsed.level !== HeadingLevel.Paragraph) {
                levels.add(parsed.level);
            }
        }
        return levels;
    }

    /**
     * Get set of heading levels from a list of heading lines.
     * @param headingLines A list of heading lines.
     * @returns A set of heading levels.
     */
    private getHeadingLevelsFromSelection(headingLines: { level: HeadingLevel; lineNumber: number }[]): Set<HeadingLevel> {
        const levels = new Set<HeadingLevel>();
        for (const line of headingLines) {
            levels.add(line.level);
        }
        return levels;
    }

    private levelToString(level: HeadingLevel): string {
        if (level === HeadingLevel.Paragraph) return 'Paragraph';
        // Assuming HeadingLevel are numbers 1-6 for H1-H6
        if (level >= 1 && level <= 6) return `H${level}`;
        return 'Paragraph';
    }
}