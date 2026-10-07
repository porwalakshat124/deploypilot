# Public search visibility

Production canonical origin: https://deploypilot-web.vercel.app

The sitemap lists only the homepage and setup guide. Dashboard, login and auth responses use noindex headers; previews also use noindex. Authentication remains responsible for protecting account data. Public pages have distinct titles, descriptions, canonical URLs, one main heading and static JSON-LD. Keywords describe actual GitHub repository deployment and team-owned Docker workers; DeployPilot does not offer free managed hosting.

Next, the owner should verify this URL-prefix property in Google Search Console and submit `/sitemap.xml`. If HTML-tag verification is selected, provide only the public verification code for inclusion in metadata. Never provide a Google password. Indexing and rankings depend on Google and useful content, reputation and links; these changes do not guarantee a ranking.

References: https://developers.google.com/search/docs/fundamentals/seo-starter-guide and https://developers.google.com/search/docs/crawling-indexing/block-indexing
