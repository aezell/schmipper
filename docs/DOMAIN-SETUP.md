# Custom Domain Setup for schmipper.live

## Files Updated for Custom Domain

### Website Configuration
- ✅ `docs/CNAME` - Created with domain "schmipper.live"
- ✅ `docs/_config.yml` - Updated URL and baseurl for custom domain
- ✅ `docs/index.html` - Updated contact email to extension@schmipper.live
- ✅ `docs/DEPLOYMENT.md` - Added DNS configuration instructions

### Project Branding
- ✅ `README.md` - Updated website link to https://schmipper.live
- ✅ `package.json` - Renamed project to "schmipper"
- ✅ `extension/package.json` - Renamed to "schmipper-extension"
- ✅ `extension/manifest.json` - Updated extension name to "Schmipper"
- ✅ `native-host/package.json` - Renamed to "schmipper-native-host"

## DNS Configuration Required

To activate the custom domain, configure these DNS records with your domain registrar:

### Option 1: CNAME Record (Recommended)
```
Type: CNAME
Name: schmipper.live (or @ for root domain)
Value: yourusername.github.io
TTL: 3600 (or default)
```

### Option 2: A Records (Alternative)
```
Type: A
Name: @
Value: 185.199.108.153
Value: 185.199.109.153
Value: 185.199.110.153  
Value: 185.199.111.153
TTL: 3600 (or default)
```

### WWW Subdomain (Optional)
```
Type: CNAME
Name: www
Value: schmipper.live
TTL: 3600 (or default)
```

## GitHub Pages Setup

1. **Repository Settings**:
   - Go to Settings → Pages
   - Source: "Deploy from a branch"
   - Branch: "main", Folder: "/docs"
   - Custom domain: "schmipper.live"
   - ✅ Enforce HTTPS

2. **Expected Timeline**:
   - GitHub Pages deployment: 5-10 minutes
   - DNS propagation: Up to 24 hours
   - SSL certificate generation: 1-2 hours after DNS propagates

## Verification

Once DNS propagates, the site will be accessible at:
- ✅ https://schmipper.live
- ✅ https://www.schmipper.live (if WWW CNAME is configured)

Contact email will be: extension@schmipper.live

## Troubleshooting

### DNS Issues
```bash
# Check DNS propagation
nslookup schmipper.live
dig schmipper.live

# Check GitHub Pages IPs
ping 185.199.108.153
```

### GitHub Pages Issues
- Check repository Actions tab for deployment status
- Verify CNAME file is in docs/ folder
- Ensure custom domain is set in repository settings
- Wait for SSL certificate provisioning (can take 1-2 hours)

The website is now ready for custom domain deployment! 🎉
