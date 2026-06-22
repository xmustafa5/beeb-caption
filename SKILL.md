---
name: react-native-rtl-positioning
description: Correct RTL/LTR layout patterns for React Native apps that use `I18nManager.forceRTL(true)` (Arabic, Hebrew, etc.). Covers flexDirection, textAlign, text-next-to-icon rows, TextInput alignment, localized dates, absolute positioning, margins, and icon flipping. Use when fixing Arabic/RTL bugs, when text drifts away from its icon in AR, when a TextInput placeholder won't align right, when items appear on the wrong side in AR, or when writing new layout code in a bilingual EN/AR app.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# React Native RTL Positioning

The single most common RTL mistake in React Native apps is **double-flipping** layout. This skill exists to stop that.

## The Setup You're Working With

If the project calls `I18nManager.forceRTL(true)` (check `i18n/index.ts` or wherever language is initialized), then in Arabic mode:

- **The native layout system is already RTL.** `flexDirection: 'row'` automatically renders right-to-left. `left: 16` automatically becomes visual right.
- **`I18nManager.swapLeftAndRightInRTL` is `true` by default** when forceRTL is on. This swaps `left`/`right` everywhere: positioning, margins, padding, and `textAlign`.
- **Restart is required** when toggling — the app reloads to apply the new layout direction.

This means: **you do NOT need to manually flip anything based on language**. The native system already does it. Manually flipping on top creates a double-flip that puts everything back to LTR-visual.

## The Rules

### 1. flexDirection — never conditional on language

```tsx
// ❌ WRONG — double-flips in AR (ends up LTR-visual)
flexDirection: isAr ? 'row-reverse' : 'row'

// ✅ RIGHT — let native RTL handle it
flexDirection: 'row'
```

If JSX order is `[Icon][Text][Chevron]`, then in EN it renders left-to-right and in AR it renders right-to-left. That's exactly what you want.

### 2. textAlign — use the same value in both languages

With `swapLeftAndRightInRTL` on:
- `textAlign: 'left'` means "start of writing direction" — visual left in EN, **visual right in AR**.
- `textAlign: 'right'` means "end of writing direction" — visual right in EN, **visual left in AR**.

```tsx
// ❌ WRONG — pushes Arabic text to the LEFT (because 'right' = end = visual left in RTL)
textAlign: isAr ? 'right' : 'left'

// ✅ RIGHT — naturally aligned at the reading start (right in AR, left in EN)
textAlign: 'left'

// ✅ RIGHT — opposite end (left in AR, right in EN). Use for values in label/value rows.
textAlign: 'right'
```

**Rule of thumb**: titles, descriptions, labels → `textAlign: 'left'`. Values that should be at the opposite end of a row → `textAlign: 'right'`.

> ⚠️ **`<TextInput>` is the exception — it does NOT honor the swap on iOS.** Everything above is true for `<Text>`. But on iOS, `<TextInput>` ignores `swapLeftAndRightInRTL`, so `textAlign: 'left'` renders as *literal* visual-left and the Arabic placeholder/content won't hug the right edge. For text fields, set the physical edge explicitly:
> ```tsx
> // ✅ For <TextInput> ONLY — the one place the isRTL conditional is correct
> textAlign: I18nManager.isRTL ? 'right' : 'left'
> ```
> This is the single case where `textAlign: isRTL ? 'right' : 'left'` is right, not a code smell. It applies to `<TextInput>` only — never copy it onto a `<Text>`.

### 2b. Text next to an icon — the row mirrors, but the text must align to the reading start

The most common real-world layout: an icon and a label side by side (service tiles, settings rows, list items). The bug is the icon ends up on the right in AR (correct — native RTL mirrored the row) but the **label still hugs the left**, leaving a gap between them.

Why: the row `flexDirection: 'row'` auto-mirrors, so `[Icon][Text]` becomes `[Text][Icon]` visually in AR — icon on the right, text to its left. But the `<Text>` sits in a `flex: 1` container, and **without an explicit `textAlign` it does not reliably hug the icon** — it can render at the container's left edge, opening a gap. Add `textAlign: 'left'` so the text aligns to the reading start (visual right in AR) and sits right against the icon.

```tsx
// ✅ RIGHT — icon + label that stay adjacent in both directions
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
  <Icon name="wallet" />
  <View style={{ flex: 1 }}>
    {/* textAlign: 'left' is REQUIRED — without it the label drifts to the
        container's left edge in AR, away from the icon */}
    <Text style={{ textAlign: 'left' }}>{label}</Text>
    <Text style={{ textAlign: 'left' }}>{subtitle}</Text>
  </View>
</View>
```

Rules for this pattern:
- **Row** → `flexDirection: 'row'` (never conditional). Native RTL puts the icon on the trailing visual side in AR automatically.
- **Every `<Text>` in the row** → `textAlign: 'left'`. This is the fix that makes the text sit *next to* the icon instead of drifting to the far edge.
- **Don't** add `writingDirection: 'ltr'` to the label — it pins the text to visual-left and re-opens the gap. (Locale-format numbers/dates instead; see §8.)
- **Trailing chevron/value** at the far end → keep it as the last JSX child; native RTL moves it to the leading visual edge in AR. Flip a directional chevron per §5.

If the label is the *only* child of a shrink-to-content `<View>` (just a `gap`, no `flex: 1` parent stretching it), `textAlign` has nothing to fill — see §6 and add `width: '100%'`.

### 3. Absolute positioning — never conditional on language

```tsx
// ❌ WRONG — double-swaps with native RTL
style={[base, isAr ? { right: 16 } : { left: 16 }]}

// ✅ RIGHT — leading edge (left in EN, right in AR)
style={{ ...base, left: 16 }}

// ✅ RIGHT — trailing edge (right in EN, left in AR)
style={{ ...base, right: 16 }}
```

Concrete: a back button at the top of a screen should use `left: 16`. A favorite/menu button on the trailing edge should use `right: 16`. Native RTL flips both for AR.

### 4. Margins and padding — same rule

```tsx
// ❌ WRONG
marginLeft: isAr ? 0 : Spacing.md, marginRight: isAr ? Spacing.md : 0

// ✅ RIGHT
marginLeft: Spacing.md   // becomes marginRight in AR via native swap
```

Use `marginStart`/`marginEnd` if you want to be extra explicit, but plain `marginLeft`/`marginRight` work fine because of the swap.

### 5. Icons do NOT auto-flip — flip chevrons manually

Native RTL swaps layout, but icon glyphs render as drawn. Directional icons (chevrons, arrows) need explicit handling:

```tsx
// Back button (the leading-edge nav button) — points the "back" direction visually
<Icon name={isAr ? 'chevron-forward' : 'chevron-back'} />
// EN: < (chevron-back) on the left, AR: > (chevron-forward) on the right

// "Tap to expand / next" affordance at the end of a row
<Icon name={isAr ? 'chevron-back' : 'chevron-forward'} />
// EN: > (chevron-forward) on the right, AR: < (chevron-back) on the left
```

Non-directional icons (heart, flag, settings, info) need no conditional.

### 6. textAlign needs a width to align within

If a `<Text>` is inside a container that shrinks to content width, `textAlign` has nothing to align in. Symptom: Arabic title appears at the left edge of its visible content even with `textAlign: 'left'`.

Fix:

```tsx
<View style={{ alignSelf: 'stretch', width: '100%' }}>
  <Text style={{ width: '100%', textAlign: 'left' }}>...</Text>
</View>
```

This is mostly a problem when the text is the only child of a `<View>` with just a `gap` style and no flex parent stretching it.

### 7. Don't set `writingDirection` on Text

`writingDirection: 'rtl'` can override or invert `textAlign` semantics in unpredictable ways. Let native RTL handle direction, and only use `textAlign`.

### 8. Dates/numbers — format with the locale, don't force `writingDirection: 'ltr'`

A common anti-pattern is rendering a date/time with the device default locale and then locking it LTR so "the digits don't reorder":

```tsx
// ❌ WRONG — English date in AR, pinned to visual-left away from its icon
const s = date.toLocaleString(undefined, { weekday: 'short', month: 'short', ... })
<Text style={{ writingDirection: 'ltr' }}>{s}</Text>
```

This shows an English date in Arabic mode AND drifts the text to the wrong edge. Instead, pass the locale so the string is localized (Arabic-Indic numerals + Arabic month/weekday), and align to the reading start like any other label:

```tsx
// ✅ RIGHT — localized date that sits next to its icon
const isAr = i18n.language === 'ar'
const s = date.toLocaleString(isAr ? 'ar' : undefined, { weekday: 'short', month: 'short', ... })
<Text style={{ textAlign: 'left' }}>{s}</Text>
```

The same applies to `toLocaleDateString` / `toLocaleTimeString`. Only keep `writingDirection: 'ltr'` for genuinely Western-only strings that must never localize (e.g. a phone number typed in Latin digits).

## Pattern Recognition (Code Smells)

When you see any of these in layout code, suspect double-flip:

- `flexDirection: isAr ? 'row-reverse' : 'row'`
- `textAlign: isAr ? 'right' : 'left'` on a **`<Text>`** (on a `<TextInput>` this is correct — see §2)
- `[isAr ? 'right' : 'left']: <value>` (computed key trick)
- `isAr ? { right: X } : { left: X }` (style array trick)
- `marginLeft: isAr ? 0 : X, marginRight: isAr ? X : 0`
- `alignSelf: isAr ? 'flex-end' : 'flex-start'`

Replace with the unconditional form (`'row'`, `'left'`, plain `left`/`right`, etc.).

## How to Debug

1. **Item on the wrong side in AR?** → grep for `isAr` / `isRTL` near that item. If you see flexDirection/positioning/textAlign conditionals, that's the bug.
2. **Title text won't right-align in AR?** → either the parent container isn't stretched (add `width: '100%'`), or you set `textAlign: 'right'` (use `'left'` instead — it becomes visual right in RTL).
3. **Chevron pointing the wrong way?** → icons don't auto-flip; add the `isAr ? 'chevron-forward' : 'chevron-back'` conditional.
4. **Want to verify forceRTL is on?** → grep for `I18nManager.forceRTL` or `I18nManager.isRTL` to confirm the setup.

## Quick Reference

| What you want | EN | AR | Code |
|---|---|---|---|
| Row, items left-to-right in EN | left→right | right→left | `flexDirection: 'row'` |
| Text aligned to reading start | left | right | `textAlign: 'left'` |
| Text aligned to reading end | right | left | `textAlign: 'right'` |
| Label next to an icon (stays adjacent) | icon→text | text←icon | `flexDirection: 'row'` + `textAlign: 'left'` on the text |
| `<TextInput>` content/placeholder to reading start | left | right | `textAlign: I18nManager.isRTL ? 'right' : 'left'` (TextInput ignores the swap) |
| Localized date/number | en | ar | `toLocaleString(isAr ? 'ar' : undefined, …)` — not `writingDirection: 'ltr'` |
| Item on leading edge (back button) | left | right | `left: 16` |
| Item on trailing edge (favorite) | right | left | `right: 16` |
| Spacing on leading side | left side | right side | `marginLeft: X` |
| Back arrow chevron | `<` | `>` | `isAr ? 'chevron-forward' : 'chevron-back'` |
| Forward/next chevron in a row | `>` | `<` | `isAr ? 'chevron-back' : 'chevron-forward'` |
| Heart, flag, settings | same | same | no conditional |

## Counter-example: when an `isAr` conditional IS correct

Conditionals on language are still right for **content**, not layout:

```tsx
// ✅ correct — choosing which translated string to render
{isAr ? 'مواصفات الفئة' : 'Trim Specs'}

// ✅ correct — choosing which icon to render (icons don't auto-flip)
<Icon name={isAr ? 'chevron-forward' : 'chevron-back'} />

// ❌ wrong — layout, not content
flexDirection: isAr ? 'row-reverse' : 'row'
```
