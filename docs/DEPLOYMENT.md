# GitHub Pages Deployment Guide

## Setup Instructions

1. **Enable GitHub Pages**:
   - Go to your repository Settings
   - Scroll down to "Pages" section
   - Under "Source", select "Deploy from a branch"
   - Choose "main" branch and "/docs" folder
   - Click "Save"

2. **Custom Domain Setup**:
   - Add "schmipper.live" in the "Custom domain" field
   - The CNAME file is already included in the docs folder
   - Configure your DNS provider to point to GitHub Pages

3. **HTTPS**:
   - GitHub Pages automatically provides HTTPS
   - Check "Enforce HTTPS" for security

## File Structure

```
docs/
├── index.html          # Main website page
├── style.css           # Neobrutalist styling
├── 404.html           # Custom 404 page
├── _config.yml        # Jekyll configuration
├── CNAME              # Custom domain configuration
└── DEPLOYMENT.md      # This file
```

## Local Development

```bash
# Navigate to docs folder
cd docs

# Start local server
python3 -m http.server 8000

# Visit http://localhost:8000
```

## Customization

### Colors
Edit the CSS variables in `style.css`:
```css
:root {
  --neon-green: #00ff41;
  --hot-pink: #ff0080;
  --electric-blue: #0080ff;
  --cyber-yellow: #ffff00;
  --toxic-orange: #ff8000;
}
```

### Content
Edit `index.html` to update:
- Extension features
- Installation instructions
- FAQ content
- Contact information

### Links
Update these placeholders in `index.html`:
- GitHub repository URLs
- Chrome Web Store link
- Contact email
- Social media links

## DNS Configuration

To point schmipper.live to GitHub Pages, configure these DNS records with your domain provider:

```
Type: CNAME
Name: schmipper.live (or @)
Value: yourusername.github.io
```

Or use A records pointing to GitHub Pages IPs:
```
Type: A
Name: @
Value: 185.199.108.153
Value: 185.199.109.153
Value: 185.199.110.153
Value: 185.199.111.153
```

## Deployment Status

Your site will be available at:
`https://schmipper.live`

Allow 5-10 minutes for initial deployment and up to 24 hours for DNS propagation.
