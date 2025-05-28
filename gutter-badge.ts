import { EditorView, ViewPlugin, ViewUpdate, gutter, GutterMarker } from '@codemirror/view';
import { Prec, RangeSet, RangeSetBuilder } from '@codemirror/state';
import { Menu } from 'obsidian';
import { HeadingLevel, HeadingHelperSettings } from './types';
import { MarkdownParser } from './parser';

const MARKER_CSS_CLASS = 'cm-heading-helper-marker';

class HeadingMarker extends GutterMarker {
    constructor(
        readonly view: EditorView,
        readonly headingLevel: HeadingLevel,
        readonly lineNumber: number,
        readonly settings: HeadingHelperSettings,
        readonly onLevelChange: (lineNumber: number, newLevel: HeadingLevel) => void
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const markerEl = document.createElement('div');
        markerEl.className = MARKER_CSS_CLASS;
        markerEl.dataset.level = String(this.headingLevel);
        markerEl.title = MarkdownParser.getHeadingTooltip(this.headingLevel);
        return markerEl;
    }

    eq(other: GutterMarker): boolean {
        return other instanceof HeadingMarker &&
            other.headingLevel === this.headingLevel &&
            other.lineNumber === this.lineNumber;
    }
}

export function createHeadingGutterPlugin(
    settings: HeadingHelperSettings,
    onLevelChange: (lineNumber: number, newLevel: HeadingLevel) => void
) {
    const markers = ViewPlugin.fromClass(
        class {
            view: EditorView;
            markers: RangeSet<HeadingMarker>;

            constructor(view: EditorView) {
                this.view = view;
                this.markers = this.buildMarkers(view);
            }

            buildMarkers(view: EditorView): RangeSet<HeadingMarker> {
                if (!settings.showGutterBadges) {
                    return RangeSet.empty;
                }

                const builder = new RangeSetBuilder<HeadingMarker>();
                const doc = view.state.doc;

                // Parse each line to detect headings
                for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
                    const line = doc.line(lineNumber);
                    const lineText = line.text;
                    const parsed = MarkdownParser.parseLine(lineText);

                    // Only show markers for actual headings (H1-H6)
                    if (parsed.level !== HeadingLevel.Paragraph) {
                        const marker = new HeadingMarker(
                            view,
                            parsed.level,
                            lineNumber,
                            settings,
                            onLevelChange
                        );
                        builder.add(line.from, line.from, marker);
                    }
                }

                return builder.finish();
            }

            update(update: ViewUpdate) {
                // Rebuild markers if document changed or settings changed
                if (update.docChanged || update.viewportChanged) {
                    this.markers = this.buildMarkers(this.view);
                }
            }
        }
    );

    return [
        markers,
        Prec.high(
            gutter({
                class: 'cm-heading-helper-gutter',
                markers(view) {
                    return view.plugin(markers)?.markers || RangeSet.empty;
                },
                domEventHandlers: {
                    click: (view, block, evt: MouseEvent) => {
                        const target = evt.target as HTMLElement;
                        if (!target?.classList.contains(MARKER_CSS_CLASS)) {
                            return false;
                        }

                        if (target.classList.contains('has-active-menu')) {
                            return true;
                        }

                        const level = target.dataset.level;
                        if (!level) return false;

                        const line = view.state.doc.lineAt(block.from);
                        const lineNumber = line.number;

                        // Show level selection menu
                        const menu = new Menu();

                        // Add paragraph option
                        menu.addItem((item) =>
                            item
                                .setTitle('Paragraph')
                                .setIcon('type')
                                .onClick(() => {
                                    onLevelChange(lineNumber, HeadingLevel.Paragraph);
                                })
                        );

                        // Add heading level options
                        for (let level = 1; level <= 6; level++) {
                            menu.addItem((item) =>
                                item
                                    .setTitle(`Heading ${level}`)
                                    .setIcon(`heading-${level}`)
                                    .onClick(() => {
                                        onLevelChange(lineNumber, level as HeadingLevel);
                                    })
                            );
                        }

                        target.classList.add('has-active-menu');

                        // Position and show menu
                        const rect = target.getBoundingClientRect();
                        menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });

                        // Remove class when menu closes (basic cleanup)
                        setTimeout(() => {
                            target.classList.remove('has-active-menu');
                        }, 100);

                        return true;
                    },
                    mousedown: (_view, _line, evt: MouseEvent) => {
                        const target = evt.target as HTMLElement;
                        return target?.classList.contains(MARKER_CSS_CLASS) || false;
                    },
                },
            })
        ),
    ];
}

export class GutterBadgeManager {
    private gutterExtension: any;

    constructor(
        private settings: HeadingHelperSettings,
        private onLevelChange: (lineNumber: number, newLevel: HeadingLevel) => void
    ) {
        this.gutterExtension = createHeadingGutterPlugin(settings, onLevelChange);
    }

    getExtension() {
        return this.gutterExtension;
    }

    updateSettings(newSettings: HeadingHelperSettings) {
        this.settings = newSettings;
        // Note: Extension will need to be recreated for settings changes
        this.gutterExtension = createHeadingGutterPlugin(newSettings, this.onLevelChange);
    }

    // Legacy method for compatibility - now handled by the gutter system
    updateBadges(view: EditorView): void {
        // The gutter system handles updates automatically through ViewPlugin
        // This method is kept for backward compatibility but is essentially a no-op
    }
}

// Export for backward compatibility
export const badgeField = null; // No longer needed with gutter approach
export const updateBadges = null; // No longer needed with gutter approach 