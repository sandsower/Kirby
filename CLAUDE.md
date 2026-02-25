<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

---

## Testing Strategy

- **TDD for libraries:** `tmux-manager` (tmux.ts, session-store.ts, claude-session.ts) — write tests first, then implement.
- **TDD for Ink components:** Use `ink-testing-library` to verify text content + keyboard navigation. No real TTY needed.
- **Manual testing only for:** ANSI/visual rendering, real tmux input forwarding.
- **Run tests via NX:** `npx nx test tmux-manager`, `npx nx test cli`.

## Milestone Checkins

At each major milestone, stop and check in with the user:
- List what was implemented
- Provide manual test commands the user can run
- Wait for confirmation before continuing

## Development Approach

- **Don't build what you can't verify.** If behavior depends on real-world interaction (e.g. Claude session patterns), don't guess — build a testable mock first, verify with the real thing later.
- **Visual first for TUI work.** Get something on screen the user can see and interact with. Mock data is fine — proving the rendering/interaction works is the priority.
- **Smallest verifiable increment.** One feature at a time, confirm it works, then layer on the next.
