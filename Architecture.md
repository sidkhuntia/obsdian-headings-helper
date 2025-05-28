# Obsidian Heading Helper Plugin - Architecture Documentation

## Overview

The Obsidian Heading Helper Plugin is a sophisticated system for managing markdown heading hierarchies in Obsidian. It consists of three core modules that work together to provide intelligent heading manipulation with hierarchy validation and visual feedback.

## Core Architecture

### Module Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    main.ts (Plugin Core)                    │
│  - Plugin lifecycle management                              │
│  - Command registration                                     │
│  - Settings management                                      │
│  - Event coordination                                       │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                heading-operations.ts                        │
│  - Primary business logic                                   │
│  - Heading transformation operations                        │
│  - Batch processing with rollback                           │
│  - Selection handling                                       │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                hierarchy-checker.ts                         │
│  - Hierarchy validation rules                               │
│  - Warning generation and display                           │
│  - Document structure analysis                              │
│  - Selection-aware validation                               │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    parser.ts                               │
│  - Markdown parsing utilities                               │
│  - Text transformation functions                            │
│  - Heading level cycling logic                              │
│  - Display text generation                                  │
└─────────────────────────────────────────────────────────────┘
```

## Detailed Code Flow Analysis

### 1. Parser Module (`parser.ts`)

**Purpose**: Foundation layer providing markdown parsing and text manipulation utilities.

#### Key Components:

**`parseLine(text: string): ParsedLine`**
- **Input**: Raw markdown line text
- **Process**: 
  1. Uses regex `LINE_PATTERN = /^(\s*)([-*+]\s+)?(#+)?\s*(.*?)$/` to decompose line
  2. Extracts: indent, list markers, heading markers (#), content
  3. Calculates heading level from marker count (max 6)
- **Output**: Structured `ParsedLine` object with all components

**`lineToText(parsed: ParsedLine, newLevel: HeadingLevel): string`**
- **Input**: Parsed line object + target heading level
- **Process**: 
  1. Generates heading marker string (`#`.repeat(newLevel))
  2. Reconstructs line preserving indent and list markers
  3. Combines components in correct order
- **Output**: Properly formatted markdown line

**`cycleHeading(currentLevel, direction, wrapAfterH6): HeadingLevel`**
- **Input**: Current level, direction (up/down/cycle), wrap setting
- **Logic Flow**:
  ```
  if currentLevel === Paragraph → return Paragraph (no cycling)
  if direction === 'up':
    if H1 → stay H1 (no promotion beyond H1)
    else → promote (level - 1)
  if direction === 'down':
    if H6 → wrapAfterH6 ? Paragraph : H6
    else → demote (level + 1)
  ```

### 2. Hierarchy Checker Module (`hierarchy-checker.ts`)

**Purpose**: Validates heading operations against hierarchy rules and provides user warnings.

#### Key Components:

**`checkAndWarnHierarchy(app, editor, currentLevel, targetLevel, lineNumber, operation)`**
- **Flow**:
  1. **Early Exit**: If hierarchy checking disabled → execute operation immediately
  2. **Validation**: Call `checkHierarchy()` to analyze the proposed change
  3. **Deduplication**: Check if same warning shown recently (1.5s window)
  4. **Notice Display**: Show warning via Obsidian Notice API (7s duration)
  5. **Blocking Logic**: If blocking warning + no override → abort operation
  6. **Execution**: If allowed → execute the operation callback

**`checkHierarchy(editor, currentLevel, targetLevel, lineNumber): HierarchyWarning | null`**
- **Critical Analysis Points**:

  1. **H1 Uniqueness Rule** (Blocking):
     ```
     if promoting to H1 AND H1 exists elsewhere → BLOCK
     Message: "Cannot promote to H1: An H1 already exists..."
     ```

  2. **Selection Context Warning** (Non-blocking):
     ```
     if promotion AND selection has both H1 and H2 → WARN
     Message: "Warning: The current selection contains both H1 and H2..."
     ```

  3. **H5→H6 Dead-end Rule** (Blocking):
     ```
     if H5→H6 AND wrapAfterH6=false AND both H5/H6 exist globally → BLOCK
     Message: "Demoting H5 to H6: 'Wrap after H6' is disabled..."
     ```

  4. **H6→Paragraph Block** (Blocking):
     ```
     if H6→Paragraph AND wrapAfterH6=false → BLOCK
     Message: "Cannot demote H6 to Paragraph..."
     ```

  5. **Orphan Detection** (Blocking):
     ```
     if H1-H5→Paragraph AND lower levels exist → BLOCK
     Message: "Converting H* to Paragraph might orphan existing lower-level headings..."
     ```

**`getExistingHeadingLevels(editor, excludeLineNumber): Set<HeadingLevel>`**
- **Purpose**: Scans entire document to build heading level inventory
- **Process**: 
  1. Iterate through all lines (0-based indexing)
  2. Skip excluded line (if provided, convert from 1-based to 0-based)
  3. Parse each line and collect non-paragraph heading levels
  4. Return as Set for O(1) lookup performance

### 3. Heading Operations Module (`heading-operations.ts`)

**Purpose**: Core business logic orchestrating heading transformations with sophisticated batch processing.

#### Key Components:

**`cycleHeading(editor, direction): Promise<void>`**
- **High-level Flow**:
  1. **Guard Check**: Exit if cycling disabled in settings
  2. **Multi-selection Support**: Process each selection independently
  3. **Delegation**: Call `processSelection()` for each selection range

**`processSelection(editor, selection, direction): Promise<void>`**
- **Detailed Flow**:
  1. **Range Calculation**: 
     ```javascript
     startLine = Math.min(anchor.line, head.line)
     endLine = Math.max(anchor.line, head.line)
     ```
  2. **Transformation Planning**:
     - Iterate through each line in selection
     - Parse line to get current heading level
     - Skip non-heading lines (Paragraph level)
     - Calculate target level using `MarkdownParser.cycleHeading()`
     - Apply level constraints (min/max settings)
     - Collect valid transformations
  3. **Batch Execution**: Call `executeBatchTransformation()`

**`executeBatchTransformation(editor, transformations, operationType, selectionStartLine, selectionEndLine): Promise<void>`**
- **Critical Two-Phase Process**:

  **Phase 1: Apply All Changes**
  ```javascript
  // Store originals for potential rollback
  const originalStates = transformations.map(t => ({
    lineNum: t.lineNum,
    originalText: editor.getLine(t.lineNum),
    originalLevel: t.currentLevel
  }));
  
  // Apply all transformations immediately
  for (const transformation of transformations) {
    this.transformLine(editor, transformation.lineNum, transformation.targetLevel);
  }
  ```

  **Phase 2: Validate & Rollback if Needed**
  ```javascript
  // Check hierarchy on final state
  const shouldContinue = await this.checkBatchHierarchy(...);
  
  if (!shouldContinue) {
    // Rollback all changes
    for (const original of originalStates) {
      editor.replaceRange(original.originalText, ...);
    }
  }
  ```

**`checkBatchHierarchy(editor, transformations, operationType, selectionStartLine, selectionEndLine): Promise<boolean>`**
- **Batch-Specific Analysis**:
  1. **Early Exit**: If hierarchy checking disabled → return true
  2. **Issue Detection**: Call `analyzeBatchTransformation()`
  3. **Representative Warning**: Show single warning for entire batch
  4. **Blocking Decision**: Return false if operation should be blocked

**`analyzeBatchTransformation(...): { type: string; message: string; }[]`**
- **Selection-Scoped Analysis** (Key Innovation):
  - Only analyzes hierarchy within the selected text range
  - Prevents false positives from document-wide analysis
  - **Critical Rules**:

  1. **Multiple H1 Creation**:
     ```javascript
     const h1Promotions = transformations.filter(t =>
       t.targetLevel === HeadingLevel.H1 && t.currentLevel !== HeadingLevel.H1
     );
     if (h1Promotions.length > 1) → BLOCK
     ```

  2. **H5→H6 Dead-end in Selection**:
     ```javascript
     if (h5ToH6.length > 0 && !wrapAfterH6) {
       const existingH6InSelection = countHeadingLevelInRange(...);
       if (existingH6InSelection > 0) → BLOCK
     }
     ```

  3. **Orphan Detection in Selection**:
     ```javascript
     // Check if converting to Paragraph would orphan lower levels within selection
     for (let level = minCurrentLevel + 1; level <= H6; level++) {
       const lowerLevelCount = countHeadingLevelInRange(...);
       if (lowerLevelCount > 0) → WARN
     }
     ```

**`transformLine(editor, lineNumber, newLevel): void`**
- **Atomic Operation**:
  1. Get current line text
  2. Parse line structure
  3. Generate new text with target level
  4. Replace line content using Obsidian's `editor.replaceRange()`

### 4. Integration Layer (`main.ts`)

**Purpose**: Orchestrates all components and provides plugin lifecycle management.

#### Key Integration Points:

**Command Registration**:
```javascript
// Each command follows this pattern:
editorCallback: async (editor: Editor) => {
  await this.headingOps.cycleHeading(editor, 'cycle');
  this.refreshBadgesForEditor(editor);  // UI sync
}
```

**Settings Synchronization**:
```javascript
async saveSettings() {
  await this.saveData(this.settings);
  
  // Recreate all managers with new settings
  this.headingOps = new HeadingOperations(this.settings, this.app);
  this.badgeManager = new GutterBadgeManager(this.settings, ...);
  this.hierarchyChecker = new HierarchyChecker(this.settings);
}
```

**Event Coordination**:
- Editor changes trigger badge updates (debounced 100ms)
- File switches trigger badge refresh (debounced 50ms)
- Layout changes trigger badge refresh (debounced 50ms)

## Data Flow Patterns

### 1. Single Line Operation
```
User Command → HeadingOperations.setHeadingLevel() 
→ HierarchyChecker.checkAndWarnHierarchy() 
→ Parser.parseLine() + Parser.lineToText() 
→ Editor.replaceRange() 
→ Badge Refresh
```

### 2. Multi-line Selection Operation
```
User Command → HeadingOperations.processSelection() 
→ Collect Transformations (Parser.cycleHeading()) 
→ Apply All Changes (transformLine()) 
→ Batch Hierarchy Check (analyzeBatchTransformation()) 
→ Potential Rollback → Badge Refresh
```

### 3. Hierarchy Validation Flow
```
Operation Request → Parse Current State → Scan Document Structure 
→ Apply Rules Engine → Generate Warnings → User Decision 
→ Execute or Abort → UI Feedback
```

## Error Handling & Edge Cases

### 1. Rollback Mechanism
- **Trigger**: Batch operation fails hierarchy validation
- **Process**: Restore original text for all modified lines
- **Safety**: Preserves document integrity even on partial failures

### 2. Warning Deduplication
- **Problem**: Rapid operations could spam warnings
- **Solution**: 1.5-second cooldown per warning type/context
- **Implementation**: Timestamp + key-based tracking

### 3. Selection Edge Cases
- **Empty selections**: Default to cursor line
- **Multi-selections**: Process each independently  
- **Cross-selection hierarchy**: Scope validation to selection bounds

### 4. Constraint Application
- **Level limits**: Apply min/max constraints after cycling
- **Wrap behavior**: Configurable H6→Paragraph conversion
- **Paragraph protection**: Prevent cycling non-headings (except H6→Paragraph)

## Performance Considerations

### 1. Lazy Loading
- Settings loaded once on plugin initialization
- Managers recreated only on settings change

### 2. Debounced Updates
- Badge refreshes debounced to prevent excessive redraws
- Hierarchy checks cached for repeated operations

### 3. Efficient Scanning
- Document scans use Set data structures for O(1) lookups
- Line parsing uses optimized regex with minimal backtracking

### 4. Batch Processing
- Multiple line changes processed as single transaction
- Rollback operates on stored state, not incremental undo

## Settings Integration

### Key Settings Impact:
- **`enableCycling`**: Gates all cycling operations
- **`checkHierarchy`**: Enables/disables validation system
- **`allowHierarchyOverride`**: Controls blocking vs warning behavior
- **`wrapAfterH6`**: Affects H6→Paragraph conversion rules
- **`minLevel`/`maxLevel`**: Constrains heading level ranges

### Dynamic Reconfiguration:
- Settings changes trigger manager recreation
- No restart required for configuration updates
- Immediate effect on subsequent operations

## Extension Points

### 1. New Hierarchy Rules
- Add rules in `HierarchyChecker.checkHierarchy()`
- Define new warning types in `HierarchyWarning` interface
- Implement rule logic with appropriate blocking behavior

### 2. Additional Operations
- Extend `HeadingOperations` with new transformation methods
- Register commands in `main.ts`
- Follow established pattern: operation → validation → UI update

### 3. Custom Parsers
- Extend `MarkdownParser` for new markdown variants
- Implement `ParsedLine` interface for custom line structures
- Maintain compatibility with existing transformation logic

This architecture provides a robust, extensible foundation for intelligent heading management while maintaining clean separation of concerns and comprehensive error handling. 