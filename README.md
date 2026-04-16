# SwiftCheckIn V2 — Hardened Multi-Tenant SaaS

Modern church attendance management system built for Ghanaian churches.

## 🔒 Security Hardening (V2)

This version addresses all security gaps identified in the V1 audit:

| Issue | V1 Status | V2 Fix |
|-------|-----------|--------|
| RLS policies | `USING (true)` | Real policies — anon key locked out |
| Server Supabase client | Used anon key | Dual client pattern with service_role |
| JWT secret | Had fallback default | Crashes if missing or < 32 chars |
| Subscription enforcement | Kiosk only | All admin routes enforce |
| Legacy passwords | Plain text fallback | bcrypt ONLY |
| Demo credentials | Visible in UI | Removed from production code |
| Rate limiting | None | Login, signup, kiosk protected |

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+
- Supabase project
- Brevo account (for emails)

### 2. Database Setup

1. Go to Supabase Dashboard → SQL Editor
2. Run `supabase-schema.sql`
3. This creates all tables, RLS policies, and seed data

### 3. Environment Variables

```bash
cp .env.example .env.local
```

Fill in all required values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # CRITICAL
JWT_SECRET=minimum-32-character-secret
BREVO_API_KEY=your-brevo-key
CRON_SECRET=your-cron-secret
```

### 4. Install & Run

```bash
npm install
npm run dev
```

### 5. Deploy to Vercel

```bash
vercel
```

Add all environment variables in Vercel Dashboard → Settings → Environment Variables.

## 📁 Project Structure

```
swiftcheckin-saas/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/           # Login, signup, logout, session
│   │   │   ├── services/       # Service CRUD
│   │   │   ├── people/         # People CRUD
│   │   │   ├── checkin/        # Check-in records
│   │   │   ├── settings/       # Kiosk settings
│   │   │   ├── kiosk/          # Public kiosk API
│   │   │   ├── export/         # CSV exports
│   │   │   └── cron/           # Birthday & missed emails
│   │   ├── admin/              # Admin dashboard
│   │   ├── kiosk/[slug]/       # Public kiosk UI
│   │   ├── login/              # Login page
│   │   ├── signup/             # Signup page
│   │   └── page.tsx            # Landing page
│   ├── lib/
│   │   ├── supabase.ts         # Dual client (server + browser)
│   │   ├── auth.ts             # Session + subscription guards
│   │   ├── rate-limit.ts       # Rate limiting
│   │   ├── email.ts            # Brevo integration
│   │   └── utils.ts            # Helpers
│   └── types/
│       └── index.ts            # TypeScript types
├── supabase-schema.sql         # Database schema + RLS
├── vercel.json                 # Cron configuration
└── .env.example                # Environment template
```

## 🔐 Security Architecture

### Row Level Security (RLS)

All tables have RLS enabled with restrictive policies:

```sql
-- Example: People table
CREATE POLICY "people_no_anon_select" ON people 
  FOR SELECT USING (false);
```

The anon key is locked out of all sensitive tables. Server APIs use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS.

### Authentication Flow

1. Login → bcrypt verify → create JWT → set httpOnly cookie
2. Protected routes call `requireActiveSubscription()`
3. Guard checks:
   - Valid session exists
   - Organization exists in database
   - Subscription is active (status + end date)

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| Login | 5/min per IP |
| Signup | 3/min per IP |
| Kiosk check-in | 30/min per org |

## 💰 Pricing (Ghana)

- **Monthly**: GHS 150/month
- **Annual**: GHS 1,500/year (2 months free)
- **Trial**: 14 days free

## 📧 Automated Emails

| Email | Trigger | Schedule |
|-------|---------|----------|
| Welcome | First-time check-in | Immediate |
| Birthday | Date of birth match | Daily 6 AM |
| Re-engagement | Missed 2+ services | Monday 9 AM |

## 🧪 Test Credentials

After running the schema, use:

- **Email**: `admin@breakfastmeeting.org`
- **Password**: `BreakfastMeeting2026!`
- **Kiosk**: `/kiosk/breakfast-meeting`

## 📊 Admin Features

- Dashboard with real-time stats
- Service management
- People directory with role assignment
- CSV exports (attendance, visitors, absentees)
- Kiosk open/close control

## 🔧 Troubleshooting

### "SUPABASE_SERVICE_ROLE_KEY is not configured"

Add the service role key from Supabase Dashboard → Settings → API → service_role (secret)

### "JWT_SECRET must be at least 32 characters"

Generate a secure secret:
```bash
openssl rand -base64 32
```

### "Account requires password reset"

The login attempt used a non-bcrypt password hash. Reset the password in the database with a proper bcrypt hash.

## 📄 License

MIT — Built for Ghanaian churches 🇬🇭


## Real image uploads for branding

The admin Settings page now supports real image uploads for:
- church logo
- kiosk background image

### Supabase setup

This build uses Supabase Storage through a server API route.

Required env vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- optional: `SUPABASE_BRANDING_BUCKET` (defaults to `branding-assets`)

When an admin uploads an image, the server will:
1. create the storage bucket automatically if it does not exist
2. upload the image with the service role key
3. return a public URL
4. save that URL into organization branding settings after the admin clicks **Save Settings**

Recommended image limits:
- logo: square PNG or JPG
- kiosk background: wide JPG/PNG
- max file size: 5MB

OWNER_EMAIL=your@email.com
NEXT_PUBLIC_OWNER_EMAILS=your@email.com
