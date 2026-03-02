# Closing the Last Mile of Web Accessibility with Voice-First Browsing

*How Amazon Nova can transform internet access for 2.2 billion people with vision impairments*

**Tags: Amazon-Nova**

---

The web was built for eyes. Thirty years of design conventions — dropdown menus, image carousels, search filters, interactive maps — assume that users can see the screen. For the 2.2 billion people worldwide living with vision impairments, this visual-first internet creates a daily barrier that most of us never think about.

Assistive technology has made progress. Screen readers like JAWS, NVDA, and VoiceOver give visually impaired users access to web content by reading the DOM tree aloud and accepting keyboard commands. But access is not the same as usability. The gap between "technically accessible" and "actually usable" is where millions of people fall through — and it is a gap that voice AI is uniquely positioned to close.

## The Usability Gap Nobody Talks About

Consider a task most of us do without thinking: searching for an apartment online.

A sighted user visits Apartments.com, types a city, adjusts filters for bedrooms and price, scrolls through listings, and clicks into the ones that look interesting. The whole process takes five minutes.

A visually impaired user using a screen reader starts the same task and immediately faces a different experience. They Tab through the site's navigation menu — dozens of links — listening to each one read aloud until they find the search bar. They type a city, then Tab through more elements to find the bedroom filter, which may be a custom dropdown that the screen reader cannot interact with at all. Fifteen minutes in, they may have reached a single listing.

The web is not inaccessible in a legal sense — most major sites pass WCAG compliance checks. But compliance measures whether content *can* be reached, not whether the experience is *usable*. A site can be fully WCAG-compliant and still take a visually impaired user five times longer to accomplish the same task as a sighted user.

This usability gap exists because screen readers translate visual interfaces into structural navigation. Users must learn the structure of every site they visit: where the navigation ends and the content begins, which headings are meaningful, which interactive elements are standard HTML and which are custom JavaScript widgets that the screen reader cannot parse. It is a cognitive overhead that compounds across every site, every task, every day.

## What If the Interface Disappeared?

The question that led to AccessVoice was simple: what if visually impaired users did not have to learn any interface at all?

Not a better screen reader. Not a more accessible website. A fundamentally different interaction model where the user describes what they want in plain language, and an AI handles all the navigation, clicking, typing, scrolling, and reading autonomously.

"Find me a two-bedroom apartment in Seattle under $2,000."

That is the entire interaction. No Tab key. No learning the site's layout. No memorizing keyboard shortcuts. The AI navigates the site visually — the same way a sighted person would — and reports back with a spoken summary.

This is what Amazon Nova makes possible. Not as a theoretical future, but as a working system today.

## Two Models, One Conversation

AccessVoice combines two Amazon Nova models into a single conversational experience:

**Amazon Nova Sonic** provides real-time bidirectional voice. The user speaks naturally, and Nova Sonic understands the request, manages the conversation flow, and responds with synthesized speech — all with sub-second latency. The conversation feels natural because it is genuinely bidirectional: Nova Sonic can acknowledge a request ("Let me search for that...") while simultaneously triggering a browsing action.

**Amazon Nova 2 Lite** provides the eyes. When a browsing task begins, Nova 2 Lite receives a screenshot of the current browser page and analyzes it visually — identifying buttons, input fields, links, and content — just like a human looking at the screen. It decides what to click, what to type, where to scroll. Then it looks at the result and decides the next action. This loop repeats until the task is complete.

The combination is what matters. Neither model alone solves the problem. A voice assistant without vision cannot navigate websites. A vision model without voice forces users back to typing and reading. Together, they create something new: a conversational browsing experience where the user's only interface is their own voice.

## Why the Browser Matters

AccessVoice runs as a Chrome Extension, not as a cloud-hosted browser. This is a deliberate architectural choice with significant implications for the community it serves.

**Authenticated access.** Visually impaired users need to access their bank accounts, healthcare portals, email, and government services. A cloud browser cannot access these — it has no session cookies, no saved passwords, no two-factor authentication tokens. A Chrome Extension runs in the user's own browser with all their existing logins intact.

**Privacy by design.** Page content never leaves the user's device. Only screenshots are sent to Nova 2 Lite for analysis, and only when the user initiates a browsing task. For a community that often relies on others to help them navigate sensitive websites, this privacy guarantee matters.

**Zero setup friction.** Installing a Chrome Extension is a single click. No servers to configure, no Docker containers to run, no technical knowledge required. For a technology aimed at reducing barriers, the deployment model cannot itself be a barrier.

**No bot detection.** Cloud-hosted browsers are frequently blocked by websites as automated traffic. The user's own Chrome browser, with their normal browsing history and cookies, is never flagged.

## Real-World Impact Scenarios

The community that AccessVoice serves is not a niche. The WHO estimates 2.2 billion people have some form of vision impairment. Within that population, the use cases are as diverse as the web itself.

**Independent living.** Apartment hunting, comparing utility providers, scheduling medical appointments, ordering groceries — tasks that require navigating multiple commercial websites with complex, inconsistent interfaces. Voice-first browsing makes each of these a single conversational request.

**Employment.** Job searching involves navigating sites like LinkedIn, Indeed, and company career pages — each with different layouts, filters, and application workflows. A voice-first browser can handle the multi-step process of searching, filtering, and reading job descriptions without requiring the user to learn each site's structure.

**Education.** Students with vision impairments can independently research topics, browse learning platforms, and access course materials on sites that may not be optimized for screen readers. The voice interaction model requires no training — students describe what they need and receive spoken answers.

**Financial independence.** Online banking, investment platforms, insurance comparison sites, and tax filing services all rely heavily on visual interfaces with forms, tables, and charts. AccessVoice can navigate these autonomously, reading back account balances, transaction histories, and form confirmations through natural conversation.

**Daily information access.** Reading the news, checking weather, looking up recipes, finding local businesses — the small tasks that sighted users do dozens of times per day without thinking. For visually impaired users, each of these currently requires deliberate effort with a screen reader. Voice-first browsing makes them effortless.

## The Adoption Path

Making AccessVoice available to the people who need it requires meeting them where they already are.

**Phase 1: Chrome Web Store.** The immediate next step is publishing AccessVoice as a free Chrome Extension. Users install it with one click and begin browsing by voice. The backend infrastructure runs on AWS, with Nova Sonic and Nova 2 Lite accessed through Amazon Bedrock. This gets the technology into the hands of individual users with zero friction.

**Phase 2: Assistive technology partnerships.** Organizations like the National Federation of the Blind, the American Foundation for the Blind, and similar groups worldwide are the trusted distribution channels for assistive technology. Partnering with these organizations provides access to user feedback from the community that matters most, and ensures the voice interaction model is refined based on real needs rather than assumptions.

**Phase 3: Enterprise and institutional adoption.** Organizations subject to ADA, Section 508, and WCAG compliance mandates — government agencies, healthcare providers, financial institutions, universities — can offer AccessVoice as a supplementary access method alongside traditional screen readers. This does not replace existing accessibility infrastructure; it adds a conversational layer on top of it.

**Phase 4: Personalization and memory.** Future versions can remember user preferences across sessions: preferred apartment criteria, shopping preferences, frequently visited sites. This transforms AccessVoice from a tool that executes individual requests into a personalized browsing assistant that understands the user's needs over time.

## A Different Kind of Accessibility

The accessibility movement has historically focused on making existing visual interfaces navigable by non-visual means. This is essential work, and screen readers will remain critical tools.

But there is a different question worth asking: what if some users do not need to navigate the interface at all?

Voice-first browsing does not make websites more accessible in the traditional sense. It makes the interface irrelevant. The user does not need to know whether a site uses a dropdown menu or a text field, whether the navigation is in a header or a sidebar, whether the search button is labeled correctly for screen readers. They describe what they want, and the AI handles the rest.

This is not a replacement for web accessibility standards. Sites should still follow WCAG guidelines. But for the millions of people who find that even accessible sites require significant effort to use, voice-first browsing offers something new: the ability to use the web the way they think about it — in terms of goals, not interface elements.

Amazon Nova Sonic and Nova 2 Lite, working together through the AWS Strands SDK, make this possible today. The models are fast enough for real-time conversation, accurate enough for autonomous browsing, and flexible enough to work on any website. The infrastructure is here. The community is waiting.

---

*AccessVoice was built for the [Amazon Nova AI Hackathon](https://amazon-nova.devpost.com/). Source code is available on [GitHub](https://github.com/sgharlow/accessvoice).*


