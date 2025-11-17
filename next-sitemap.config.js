/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.SITE_URL || 'https://verbrawl.vercel.app', // Replace with your production domain
  generateRobotsTxt: true, // Generate robots.txt file
  changefreq: 'daily',
  priority: 0.7,
  sitemapSize: 5000,
  generateIndexSitemap: false, // Generate a single sitemap.xml instead of index
  exclude: [
    '/api/*', // Exclude API routes
    '/server-sitemap.xml', // Exclude server sitemap
  ],
};