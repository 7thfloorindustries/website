# Cloudflare Setup Guide

This guide covers setting up Cloudflare's free tier for DDoS protection and performance optimization for 7th Floor Digital.

## Prerequisites

- Domain registered (7thfloor.digital)
- Access to domain registrar DNS settings
- Cloudflare account (free tier)

## Step 1: Create Cloudflare Account

1. Go to [cloudflare.com](https://cloudflare.com)
2. Sign up for a free account
3. Verify your email

## Step 2: Add Your Domain

1. Click "Add a Site" in Cloudflare dashboard
2. Enter `7thfloor.digital`
3. Select the **Free** plan
4. Cloudflare will scan existing DNS records

## Step 3: Update Nameservers

1. Cloudflare will provide two nameservers (e.g., `ada.ns.cloudflare.com`)
2. Log into your domain registrar
3. Replace existing nameservers with Cloudflare's
4. Wait for propagation (up to 24 hours, usually faster)

## Step 4: Configure SSL/TLS

1. Go to **SSL/TLS** in Cloudflare dashboard
2. Set mode to **Full (strict)**
3. Enable **Always Use HTTPS**
4. Enable **Automatic HTTPS Rewrites**

## Step 5: Enable Security Features

### Bot Fight Mode (Free)

1. Go to **Security** → **Bots**
2. Enable **Bot Fight Mode**
3. This blocks known malicious bots automatically

### Under Attack Mode

1. Go to **Security** → **Settings**
2. **Under Attack Mode** adds a 5-second challenge page
3. Only enable during active attacks
4. Can be toggled via API for automation

### Security Level

1. Go to **Security** → **Settings**
2. Set **Security Level** to **Medium** for normal operation
3. Increase to **High** or **I'm Under Attack** during incidents

### Firewall Rules (Free Tier: 5 Rules)

Recommended rules:

```
# Block known bad countries (if applicable)
# Rule: (ip.geoip.country eq "XX")
# Action: Block

# Require minimum TLS version
# Rule: (ssl != true)
# Action: Block

# Block empty user agents on API
# Rule: (http.request.uri.path contains "/api/" and http.user_agent eq "")
# Action: Block
```

## Step 6: Configure Caching

1. Go to **Caching** → **Configuration**
2. Set **Caching Level** to **Standard**
3. Set **Browser Cache TTL** to **Respect Existing Headers**

### Page Rules (Free Tier: 3 Rules)

```
# Cache static assets aggressively
# URL: *7thfloor.digital/*.js
# Setting: Cache Level = Cache Everything, Edge Cache TTL = 1 month

# URL: *7thfloor.digital/*.css
# Setting: Cache Level = Cache Everything, Edge Cache TTL = 1 month

# Don't cache API routes
# URL: *7thfloor.digital/api/*
# Setting: Cache Level = Bypass
```

## Step 7: Enable Performance Features

1. **Speed** → **Optimization**
   - Enable **Auto Minify** (JavaScript, CSS, HTML)
   - Enable **Brotli** compression
   - Enable **Early Hints**
   - Enable **Rocket Loader** (test thoroughly - may conflict with some JS)

2. **Speed** → **Image Optimization** (if using Cloudflare Images)
   - Enable **Polish** (lossy or lossless)
   - Enable **Mirage** for mobile optimization

## Step 8: Configure Turnstile

Turnstile is Cloudflare's CAPTCHA alternative, already integrated in this project.

1. Go to **Turnstile** in Cloudflare dashboard
2. Click **Add Widget**
3. Enter site name: `7th Floor Digital`
4. Add domain: `7thfloor.digital`
5. Select **Managed** widget type
6. Copy the **Site Key** and **Secret Key**
7. Add to environment variables:
   ```
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-site-key
   TURNSTILE_SECRET_KEY=your-secret-key
   ```

## Monitoring & Alerts

1. Go to **Analytics** for traffic insights
2. Go to **Security** → **Events** to monitor blocked threats
3. Set up **Notifications** for security events:
   - DDoS attack alerts
   - Firewall rule triggers
   - SSL certificate expiry

## Emergency Procedures

### During a DDoS Attack

1. Enable **Under Attack Mode**:
   - Dashboard: Security → Settings → Under Attack Mode: ON
   - API: `curl -X PATCH "https://api.cloudflare.com/client/v4/zones/{zone_id}/settings/security_level" -H "Authorization: Bearer {token}" -d '{"value":"under_attack"}'`

2. Increase **Security Level** to **I'm Under Attack**

3. Monitor **Analytics** → **Security** for attack patterns

4. Create temporary firewall rules to block attack vectors

### After Attack Subsides

1. Disable **Under Attack Mode**
2. Reset **Security Level** to **Medium**
3. Review logs and adjust permanent firewall rules
4. Document attack patterns for future reference

## API Access

For automation, get your API token:

1. Go to **My Profile** → **API Tokens**
2. Create token with **Zone** → **Settings** → **Edit** permission
3. Store securely (never commit to repo)

## Resources

- [Cloudflare Documentation](https://developers.cloudflare.com/)
- [Cloudflare Status](https://www.cloudflarestatus.com/)
- [Cloudflare Community](https://community.cloudflare.com/)
