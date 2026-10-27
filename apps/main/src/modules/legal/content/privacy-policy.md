## 1. Introduction

Tamery ("we," "our," "us"), owned by Wannabe Space, LLC, is a database management application. This Privacy Policy describes what data we collect, how we store and protect it, and what we never touch.

## 2. What We Store

### Account and Session Data

- Name, email address, optional profile photo
- Authentication data: session tokens, login method, IP address, user agent
- Subscription and billing status (processed via Stripe)

### Connection Information

Database connection details (host, port, type, username) are **always encrypted locally** using AES-256-GCM with a user-specific key. Passwords are **never sent to our servers by default** — they stay on your device. If you explicitly enable cloud sync for a connection, an encrypted version (password included) is stored in our cloud infrastructure. You can disable this at any time.

### Chat History

AI conversation history is stored both locally on your device and synced to our cloud servers to enable access across devices.

### Analytics

Usage events collected via PostHog (EU servers), linked to your account's ID, email and name. Events carry counts and categories only, never passwords, connection strings, query text or database contents. In the app, session recording is enabled with all database inputs and data masked. Our website sends page views and account actions (such as sign-in, downloads and plan changes) to PostHog without cookies or device storage and without session recording, and additionally uses DataFast for aggregated traffic analytics (page views, referrers, campaign sources).

## 3. What We Never Store

- **Your database contents** — rows, query results, table data. All queries run directly between your device and your database. This data never passes through our servers.
- **Unencrypted credentials** — passwords are never stored in plain text, anywhere.

## 4. What We Send to AI Providers

When you use AI features, we send:

- Your database **schema** (table names, column names, types, enums) — never raw row data
- Your chat messages and query context

In rare cases, an AI model may invoke a database query tool to fetch a limited number of rows to assist you — this only happens as part of an explicit AI action, not automatically. Sensitive columns are masked when possible.

AI requests are routed through **OpenRouter** to **Anthropic** (primary), **OpenAI**, and **Google** as fallback providers depending on the feature.

## 5. Third-Party Services

| Service                    | Purpose                                     |
| -------------------------- | ------------------------------------------- |
| OpenRouter                 | Routing AI requests to the model providers  |
| Anthropic, OpenAI, Google  | AI-powered SQL generation and assistance    |
| Stripe                     | Subscription billing and payment processing |
| PostHog (EU)               | Usage analytics (inputs masked)             |
| DataFast                   | Website traffic analytics (marketing site)  |
| Resend                     | Transactional email delivery                |
| Exa                        | Web search for AI features                  |
| Upstash / Context7         | Documentation lookup for AI features        |
| Google OAuth, GitHub OAuth | Social login                                |

## 6. Authentication Methods

Email sign-in codes, Google OAuth, GitHub OAuth, and two-factor authentication (2FA).

## 7. Your Responsibilities — Backups and Risk

**You are solely responsible for maintaining your own backups of your databases and their contents.** We do not back up your database data.

We implement reasonable security measures, but no system is fully secure. **We do not take responsibility for any data loss, corruption, or unauthorized access or leak** — whether on your side, your database provider's side, or our side. You use Tamery at your own risk.

## 8. Your Rights

- **View / Export**: Access your personal data and request a copy
- **Update**: Modify your profile at any time
- **Delete**: Permanently delete your account and all associated data
- **Remove connections**: Delete individual connection entries
- **Password sync**: Control whether connection passwords are synced to cloud

## 9. Data Retention

- Account data retained while your account is active
- Session tokens expire automatically
- Analytics retained for service improvement
- Full deletion available on request

## 10. Contact

- **X**: [@tamery_app](https://x.com/tamery_app)
- **Website**: [https://tamery.app](https://tamery.app)
