import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { HeadingLevel, HeadingHelperSettings } from './types';
import { MarkdownParser } from './parser';

class HeadingBadgeWidget extends WidgetType {
    constructor(
        private level: HeadingLevel,
        private lineNumber: number,
        private settings: HeadingHelperSettings,
        private onLevelChange: (lineNumber: number, newLevel: HeadingLevel) => void
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const badge = document.createElement('span');
        badge.className = 'heading-helper-badge';
        badge.textContent = MarkdownParser.getHeadingDisplayText(this.level);
        badge.title = MarkdownParser.getHeadingTooltip(this.level);

        // Apply subtle styling
        badge.style.cssText = `
			display: inline-block;
			padding: 1px 4px;
			margin-right: 4px;
            margin-top: 4px;
			border-radius: 2px;
			font-size: 9px;
			font-weight: normal;
			cursor: pointer;
			user-select: none;
			background-color: color-mix(in srgb, ${this.settings.badgeBackgroundColor} 40%, transparent 60%);
			color: color-mix(in srgb, ${this.settings.badgeTextColor} 70%, transparent 30%);
			border: none;
			opacity: 0.6;
			transition: opacity 0.2s ease;
		`;

        // Hover effect for better visibility
        badge.addEventListener('mouseenter', () => {
            badge.style.opacity = '1';
        });

        badge.addEventListener('mouseleave', () => {
            badge.style.opacity = '0.6';
        });

        // Click handler for level selection
        badge.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showLevelMenu(badge);
        });

        return badge;
    }

    private showLevelMenu(badge: HTMLElement): void {
        const menu = document.createElement('div');
        menu.className = 'heading-helper-menu';
        menu.style.cssText = `
			position: absolute;
			z-index: 1000;
			background: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 4px;
			box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
			padding: 4px 0;
			min-width: 120px;
		`;

        // Create menu items
        const levels = [
            { level: HeadingLevel.Paragraph, label: 'Paragraph' },
            { level: HeadingLevel.H1, label: 'Heading 1' },
            { level: HeadingLevel.H2, label: 'Heading 2' },
            { level: HeadingLevel.H3, label: 'Heading 3' },
            { level: HeadingLevel.H4, label: 'Heading 4' },
            { level: HeadingLevel.H5, label: 'Heading 5' },
            { level: HeadingLevel.H6, label: 'Heading 6' }
        ];

        levels.forEach(({ level, label }) => {
            const item = document.createElement('div');
            item.className = 'heading-helper-menu-item';
            item.textContent = label;
            item.style.cssText = `
				padding: 6px 12px;
				cursor: pointer;
				display: flex;
				align-items: center;
				font-size: 13px;
				${level === this.level ? 'background: var(--background-modifier-hover);' : ''}
			`;

            if (level === this.level) {
                const checkmark = document.createElement('span');
                checkmark.textContent = '✓';
                checkmark.style.marginRight = '8px';
                item.prepend(checkmark);
            }

            item.addEventListener('click', () => {
                this.onLevelChange(this.lineNumber, level);
                menu.remove();
            });

            item.addEventListener('mouseenter', () => {
                item.style.background = 'var(--background-modifier-hover)';
            });

            item.addEventListener('mouseleave', () => {
                item.style.background = level === this.level ? 'var(--background-modifier-hover)' : '';
            });

            menu.appendChild(item);
        });

        // Position menu
        const rect = badge.getBoundingClientRect();
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom + 4}px`;

        // Add to DOM
        document.body.appendChild(menu);

        // Close menu on outside click
        const closeMenu = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
}

// State effect for updating badges
export const updateBadges = StateEffect.define<DecorationSet>();

// State field for managing badge decorations
export const badgeField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(badges, tr) {
        badges = badges.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(updateBadges)) {
                badges = e.value;
            }
        }
        return badges;
    },
    provide: f => EditorView.decorations.from(f)
});

export class GutterBadgeManager {
    constructor(
        private settings: HeadingHelperSettings,
        private onLevelChange: (lineNumber: number, newLevel: HeadingLevel) => void
    ) { }

    createBadgeDecorations(view: EditorView): DecorationSet {
        if (!this.settings.showGutterBadges) {
            return Decoration.none;
        }

        const decorations: any[] = [];
        const doc = view.state.doc;

        for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
            const line = doc.line(lineNumber);
            const lineText = line.text;
            const parsed = MarkdownParser.parseLine(lineText);

            // Only show badges for actual headings (H1-H6), not paragraphs or empty lines
            if (parsed.level !== HeadingLevel.Paragraph) {
                const widget = new HeadingBadgeWidget(
                    parsed.level,
                    lineNumber,
                    this.settings,
                    this.onLevelChange
                );

                decorations.push(
                    Decoration.widget({
                        widget,
                        side: -1
                    }).range(line.from)
                );
            }
        }

        return Decoration.set(decorations);
    }

    updateBadges(view: EditorView): void {
        const decorations = this.createBadgeDecorations(view);
        view.dispatch({
            effects: updateBadges.of(decorations)
        });
    }
} 