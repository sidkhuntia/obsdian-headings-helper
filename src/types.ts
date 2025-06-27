export enum HeadingLevel {
    Paragraph = 0,
    H1 = 1,
    H2 = 2,
    H3 = 3,
    H4 = 4,
    H5 = 5,
    H6 = 6
}

export interface HeadingHelperSettings {
    enableCycling: boolean;
    showGutterBadges: boolean;
    wrapAfterH6: boolean;
    minLevel: HeadingLevel;
    maxLevel: HeadingLevel;
    badgeBackgroundColor: string;
    badgeTextColor: string;
    checkHierarchy: boolean;
    allowHierarchyOverride: boolean;
}

export interface LineInfo {
    lineNumber: number;
    text: string;
    headingLevel: HeadingLevel;
    indent: string;
    listMarker: string;
    headingMarker: string;
    content: string;
}

export interface ParsedLine {
    indent: string;
    listMarker: string;
    headingMarker: string;
    content: string;
    level: HeadingLevel;
} 