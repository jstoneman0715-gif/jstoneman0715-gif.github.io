# MMA News Updater Agent

This folder contains the MMA news updater agent.

Files:
- fetch-mma-news.js — fetches MMA news from NewsAPI and finds fighter images
- mma-news.json — cached article data
- mma-news.astro — demo page (Astro)
- update-mma-news.yml — workflow snippet (copy to .github/workflows to enable in this repo)

Setup:
1. Add NEWS_API_KEY secret to repo Actions secrets.
2. (Optional) Add PAGES_DEPLOY_TOKEN to enable deployment.
3. Copy update-mma-news.yml into .github/workflows/ to enable scheduled runs.

