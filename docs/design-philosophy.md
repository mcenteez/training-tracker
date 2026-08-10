# Training Tracker Design Philosophy

## Purpose

This document defines the visual and interaction philosophy for Training Tracker so new screens feel cohesive, intentional, and high quality from day one.

The goal is not just to make screens look modern. The goal is to make coaching operations faster, athlete workflows simpler, and critical actions clearer under real-world pressure.

## Product Feel

Training Tracker should feel:

- Focused: low cognitive load, clear hierarchy, obvious next action.
- Athletic: energetic but controlled, with strong visual structure.
- Trustworthy: stable patterns, predictable behavior, and legible data.
- Efficient: optimized for repeated daily workflows, not one-time exploration.

## Core Principles

1. Clarity over decoration

- Every visual choice should increase comprehension or confidence.
- Decorative effects are used sparingly and only when they support hierarchy.

2. Strong hierarchy everywhere

- Users should immediately identify page title, primary action, and current status.
- Information density should scale by role and task complexity.

3. Consistency at interaction boundaries

- Similar actions must look and behave the same across modules.
- Success, error, empty, and loading states must follow shared patterns.

4. Mobile-first for athlete workflows

- Athlete screens prioritize thumb reach, concise copy, and large hit targets.
- Staff screens remain responsive and keyboard-efficient on desktop.

5. Accessibility as default quality

- Semantic HTML, visible focus states, keyboard support, and contrast compliance are non-negotiable.

## Tailwind-First System Strategy

We will use Tailwind as a design system engine, not just a utility grab bag.

1. Tokenize first

- Use semantic tokens through CSS custom properties in global styles.
- Keep role-based meaning in tokens (surface, border, muted text, danger, success) instead of hardcoding hex values in components.

2. Utility composition rules

- Prefer clear utility groupings by intent: layout, spacing, typography, color, interaction.
- Avoid long, unstructured class strings that hide intent.
- Extract repeated patterns into shared components once duplication appears in 3 or more places.

3. Layout and spacing rhythm

- Use a predictable spacing rhythm and consistent max-width containers.
- Establish canonical page shells for dashboard, detail, form-heavy, and athlete views.

4. Typography discipline

- Define explicit type scale usage by context: page title, section title, body, label, metadata.
- Keep line lengths readable and avoid tiny low-contrast text.

## Component Library Policy

Primary UI system and component policy:

- shadcn/ui plus Radix UI is the default and preferred component approach.
- Tailwind utilities are used to theme and compose these components within our token system.
- Tailwind Plus is not part of the design system strategy for this project.

How this policy is applied:

1. Default to shared primitives first

- Build screens from shared shadcn plus Radix primitives before introducing new one-off patterns.
- If a component exists in our primitive layer, reuse it rather than rebuilding styling per page.

2. Extend through composition

- Create product-level components by composing primitives (for example role badges, member rows, assignment cards).
- Keep variants centralized so behavior and appearance remain predictable.

3. Avoid parallel UI systems

- Do not introduce a second styled component library that competes with the primary system.
- Do not import Tailwind Plus templates or patterns into product code.

## Component Library Decision

Primary component foundation:

- shadcn/ui plus Radix UI primitives for accessible, composable interaction components.

Why this fits:

- Aligns with the planned stack in engineering guidance.
- Works naturally with Tailwind and token-based styling.
- Gives strong accessibility defaults for dialogs, menus, popovers, and form controls.
- Keeps implementation control in-repo instead of black-box external styling systems.

Usage model:

1. Base primitives

- Use shadcn plus Radix for low-level interaction components (buttons, inputs, dialogs, selects, tabs, dropdowns, toasts).

2. Product components

- Build feature-level components on top (team cards, athlete assignment rows, workout status chips, role badges).

3. Pattern components

- Build reusable page-level patterns (page header with actions, split-panel detail layout, filter bar, empty-state block).

## Interaction and Motion Guidelines

1. Motion is purposeful

- Use short transitions to communicate state changes, not to decorate.
- Prefer fade/slide micro-transitions for panels, banners, and form feedback.

2. Feedback is immediate

- Primary actions should show pending/disabled state instantly.
- Every mutation must produce explicit success or actionable failure feedback.

3. Progressive disclosure

- Keep advanced filters and secondary controls discoverable but collapsed by default.

## Color and Theming Direction

1. Base direction

- Neutral foundation with clear semantic accents for success, warning, and risk.
- Avoid overreliance on one accent color.

2. Dark mode

- Dark mode should be first-class, not inverted afterthought.
- Contrast and border hierarchy must remain legible in both themes.

3. Data readability

- Charts, badges, and statuses must pass contrast checks and remain distinguishable for color-vision diversity.

## Screen Composition Standards

1. Every screen includes

- Clear title and context.
- Primary action and optional secondary actions.
- State handling: loading, empty, success, error.

2. Form standards

- Labels are always visible.
- Errors are inline and specific.
- Validation and submit states are obvious.

3. Data table and list standards

- Scannable row rhythm.
- Sticky action areas where useful.
- Bulk actions only when operationally necessary.

## Quality Checklist for UI Work

Any new or refactored screen should pass this checklist:

1. Visual hierarchy is obvious in 3 seconds.
2. Primary action is unmistakable.
3. Keyboard navigation is complete and focus is visible.
4. Empty/loading/error states are implemented.
5. Dark and light theme both look intentional.
6. Reused patterns use shared components, not one-off class piles.
7. No sensitive authorization assumptions are encoded in client-only visibility.

## Immediate Implementation Plan

1. Establish shared primitives

- Introduce shadcn plus Radix base components and normalize token usage.

2. Build layout patterns

- Create reusable app shell, page header, card, table region, and empty-state components.

3. Refactor current pages

- Refresh onboarding and app dashboard using standardized shadcn plus Radix primitives and shared page patterns.

4. Add visual review step

- Include a design review checklist in PRs for UI-impacting changes.

## Non-Goals

- Creating a separate design-only framework disconnected from product delivery.
- Heavy animation systems that reduce performance or clarity.
- Theme experimentation that breaks consistency across core workflows.
