# Prizen Site

Static website for `prizen.app`.

## Pages

- `/` - landing page
- `/privacy` - Privacy Policy
- `/terms` - Terms of Service
- `/support` - support contact
- `/delete-account` - account deletion instructions

## Local Preview

Open `index.html` directly, or run:

```bash
npm install
npm run dev
```

## Vercel Setup

When creating the Vercel project:

- Framework preset: `Other`
- Root directory: `site`
- Build command: leave empty
- Output directory: leave empty

After deployment, add the custom domain:

```txt
prizen.app
www.prizen.app
```

Vercel will show the DNS records that need to be added at the domain registrar.

## Support Email

The site uses:

```txt
support@prizen.app
```

Set this mailbox up before public launch.
