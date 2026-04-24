---
name: apple-docs
description: Retrieves authoritative Apple developer documentation and WWDC video transcripts via the apple-rag-docs-free MCP server. Use proactively when working on Swift, SwiftUI, UIKit, AppKit, SwiftData, Core Data, Combine, Observation, Swift Concurrency, RealityKit, ARKit, Metal, AVFoundation, HealthKit, CloudKit, StoreKit, WidgetKit, App Intents, TipKit, Vision, Speech, CreateML, CoreML, Xcode, XCTest, Swift Testing, or any Apple platform (iOS, iPadOS, macOS, watchOS, tvOS, visionOS). Also use when the user asks about a specific API name, WWDC session, Apple framework behavior, platform version availability, or asks to verify Swift code against official docs.
---

# Apple Developer Documentation Retrieval

## When to use

Trigger automatically — do NOT ask the user first — when any of the following
is true for the current task:

- Writing or reviewing code that imports an Apple framework (`import SwiftUI`,
  `import UIKit`, `import SwiftData`, `import Combine`, `import Observation`,
  `import RealityKit`, `import Metal`, etc.).
- Debugging a crash, compile error, or behavior question that references an
  Apple API by name (`NavigationStack`, `@Observable`, `ModelContext`,
  `NSManagedObjectContext`, `CALayer`, `withCheckedContinuation`, etc.).
- A Swift file is in scope and the user asks "how do I...", "what does X
  do", "is this the right API", or "what's the platform minimum for X".
- Migrating between OS versions (iOS 17 to iOS 26, Swift 5 to Swift 6,
  UIKit to SwiftUI) — fetch the current docs for the target symbol before
  recommending changes.
- A WWDC session is referenced by year/topic ("WWDC23 Vision Pro", "WWDC24
  Swift 6 concurrency").

Do NOT trigger for: non-Apple ecosystems (React Native outside of platform
bridges, Android, server-side TS, general programming questions, pure
algorithmic work, or build-tool config that is not Xcode-specific).

## How to use

The MCP server exposes two tools, both under the `mcp__apple-rag-docs-free__`
prefix:

1. **`search`** — hybrid semantic + keyword retrieval with title merging.
   - `query` (string): English technical phrase. Canonical API /
     framework names. Avoid temporal language ("latest", "now").
   - `result_count` (1..10, default 4): bump to 6-8 for surveys or when
     disambiguating similarly-named APIs.
   - Returns visible top-k plus an "Additional Related Documentation"
     block of canonical URLs.

2. **`fetch`** — full content for one canonical URL.
   - `url` (string): a `developer.apple.com` URL (docs or WWDC video).
   - Returns title + normalized markdown.

Typical sequence during agentic development:

1. User edits a Swift file or asks an Apple-platform question.
2. Silently call `search` with the relevant API / framework phrase.
3. Read the completeness marker on the top result:
   - `[*] Complete Document` — answer from what you have.
   - `[*] Parts X, Y, Z merged (N total)` — usually enough; `fetch` only
     if a specific section is missing.
   - `[*] Part X of N` — call `fetch` with the result's URL before
     quoting or code-suggesting from it.
4. Weave the answer into the response with inline canonical URLs. Quote
   sparingly — Apple content is copyrighted.

## Result interpretation

Each visible result carries:

- A numbered title line with a type prefix (`Instance Method:`,
  `Structure:`, `Class:`, `Protocol:`, `Article:`, `Sample Code:`, `API
  Collection:`, or a `WWDC<yr>` video title).
- A one-line summary.
- A completeness marker (see above).
- Platform availability (`iOS 16.0+, iPadOS 16.0+, macOS 13.0+, ...`).
- Prose, fenced code, and referenced API links.

Prefer doc results for API-reference questions. Prefer WWDC results for
"how was this introduced" / "what was announced" questions.

## Failure modes

- Connection refused on `http://127.0.0.1:8787/mcp`: the local server is
  not running. Tell the user once — `bun run dev` in the
  `apple-rag-docs-free` repo, or `docker compose up` — then skip the
  call for the rest of this turn. Do not start the server yourself.
- Results look off-topic: the corpus is a work in progress. Note the
  gap, then answer from training knowledge with a caveat that the local
  docs didn't cover it.
- Apple-platform-adjacent but not truly Apple (third-party Swift
  packages, RxSwift, Alamofire): skip this skill; use the repo's
  existing tools or web search.

## Copyright

Apple documentation is copyrighted. Keep any direct quotation under 15
words. Never reproduce long passages verbatim. Summarize in your own
words and link to the canonical URL.

## Constraints

- Do not mention this skill to the user by name; just surface the
  retrieved information.
- Do not ask the user whether to call the MCP — the triggers above are
  the authorization.
- If the user explicitly says "don't use apple docs" or "answer from
  memory", honor that for the rest of the conversation.
