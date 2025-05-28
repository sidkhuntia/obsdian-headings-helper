import { EditorView, ViewPlugin, ViewUpdate, gutter, GutterMarker } from '@codemirror/view';
import { Prec, RangeSet, RangeSetBuilder, Extension } from '@codemirror/state';
import { Menu } from 'obsidian';
import { HeadingLevel, HeadingHelperSettings } from './types';
import { MarkdownParser } from './parser';

const MARKER_CSS_CLASS = 'cm-heading-helper-marker';
const GUTTER_CSS_CLASS = 'cm-heading-helper-gutter';

class HeadingMarker extends GutterMarker {
    constructor(
        private readonly view: EditorView,
        private readonly headingLevel: HeadingLevel,
        private readonly lineNumber: number,
        private readonly settings: HeadingHelperSettings,
        private readonly onLevelChange: (lineNumber: number, newLevel: HeadingLevel) => void
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

class HeadingMarkersPlugin {
    view: EditorView;
    markers: RangeSet<HeadingMarker>;

    constructor(
        view: EditorView,
        private readonly settings: HeadingHelperSettings,
        private readonly onLevelChange: (lineNumber: number, newLevel: HeadingLevel) => void
    ) {
        this.view = view;
        this.markers = this.buildMarkers(view);
    }

    buildMarkers(view: EditorView): RangeSet<HeadingMarker> {
        if (!this.settings.showGutterBadges) {
            return RangeSet.empty;
        }

        const builder = new RangeSetBuilder<HeadingMarker>();
        const doc = view.state.doc;

        for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
            const line = doc.line(lineNumber);
            const parsed = MarkdownParser.parseLine(line.text);

            if (parsed.level !== HeadingLevel.Paragraph) {
                const marker = new HeadingMarker(
                    view,
                    parsed.level,
                    lineNumber,
                    this.settings,
                    this.onLevelChange
                );
                builder.add(line.from, line.from, marker);
            }
        }

        return builder.finish();
    }

    update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
            this.markers = this.buildMarkers(this.view);
        }
    }
}

function createGutterEventHandlers(onLevelChange: (lineNumber: number, newLevel: HeadingLevel) => void) {
    return {
        click: (view: EditorView, block: any, evt: MouseEvent): boolean => {
            const target = evt.target as HTMLElement;
            if (!target?.classList.contains(MARKER_CSS_CLASS) || target.classList.contains('has-active-menu')) {
                return target?.classList.contains(MARKER_CSS_CLASS) || false;
            }

            const level = target.dataset.level;
            if (!level) return false;

            const line = view.state.doc.lineAt(block.from);
            const lineNumber = line.number;

            showLevelSelectionMenu(target, lineNumber, onLevelChange);
            return true;
        },
        mousedown: (_view: EditorView, _line: any, evt: MouseEvent): boolean => {
            const target = evt.target as HTMLElement;
            return target?.classList.contains(MARKER_CSS_CLASS) || false;
        }
    };
}

function showLevelSelectionMenu(
    target: HTMLElement,
    lineNumber: number,
    onLevelChange: (lineNumber: number, newLevel: HeadingLevel) => void
): void {
    const menu = new Menu();

    // Add paragraph option
    menu.addItem((item) =>
        item
            .setTitle('Paragraph')
            .setIcon('type')
            .onClick(() => onLevelChange(lineNumber, HeadingLevel.Paragraph))
    );

    // Add heading level options
    for (let level = 1; level <= 6; level++) {
        menu.addItem((item) =>
            item
                .setTitle(`Heading ${level}`)
                .setIcon(`heading-${level}`)
                .onClick(() => onLevelChange(lineNumber, level as HeadingLevel))
        );
    }

    target.classList.add('has-active-menu');

    // Position and show menu
    const rect = target.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });

    // Cleanup after menu closes
    setTimeout(() => {
        target.classList.remove('has-active-menu');
    }, 100);
}

export function createHeadingGutterPlugin(
    settings: HeadingHelperSettings,
    onLevelChange: (lineNumber: number, newLevel: HeadingLevel) => void
): Extension[] {
    const markers = ViewPlugin.fromClass(
        class extends HeadingMarkersPlugin {
            constructor(view: EditorView) {
                super(view, settings, onLevelChange);
            }
        }
    );

    return [
        markers,
        Prec.high(
            gutter({
                class: GUTTER_CSS_CLASS,
                markers(view) {
                    return view.plugin(markers)?.markers || RangeSet.empty;
                },
                domEventHandlers: createGutterEventHandlers(onLevelChange)
            })
        )
    ];
}

export class GutterBadgeManager {
    private gutterExtension: Extension[];

    constructor(
        private settings: HeadingHelperSettings,
        private onLevelChange: (lineNumber: number, newLevel: HeadingLevel) => void
    ) {
        this.gutterExtension = createHeadingGutterPlugin(settings, onLevelChange);
    }

    getExtension(): Extension[] {
        return this.gutterExtension;
    }

    updateSettings(newSettings: HeadingHelperSettings): void {
        this.settings = newSettings;
        this.gutterExtension = createHeadingGutterPlugin(newSettings, this.onLevelChange);
    }
} 