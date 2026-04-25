#!/usr/bin/env python3
"""CyberQuantic - Social Media Auto-Publisher
Publie automatiquement 1 article du blog par jour sur Twitter/X et LinkedIn.
"""
import json
import os
import sys
import random
import requests
from datetime import datetime
from pathlib import Path

# ── Configuration ──────────────────────────────────────────
BASE_URL = "https://tools.cyberquantic.com"
BLOG_DIR = Path(__file__).parent.parent / "blog"
POSTS_FILE = BLOG_DIR / "posts.json"
PUBLISHED_FILE = Path(__file__).parent / "published_social.json"

# Category emojis for social posts
CAT_EMOJIS = {
    "Santé": "🏥", "Industrie & Production": "🏭", "Finance & Banque": "🏦",
    "Commerce & Retail": "🛍️", "Juridique": "⚖️", "Énergie & Environnement": "⚡",
    "Transport & Logistique": "🚚", "RH & Éducation": "👥", "IT & Cybersécurité": "🔐",
    "Secteur Public": "🏛️", "Agriculture": "🌾", "R&D & Innovation": "🧪",
    "IA Générale": "🤖"
}

# ── Helper functions ──────────────────────────────────────

def load_published():
    """Load list of already published article slugs."""
    if PUBLISHED_FILE.exists():
        with open(PUBLISHED_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"twitter": [], "linkedin": [], "history": []}

def save_published(data):
    """Save published articles tracker."""
    with open(PUBLISHED_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def pick_article(posts, published):
    """Pick the next unpublished article."""
    published_slugs = set(published.get("twitter", []) + published.get("linkedin", []))
    unpublished = [p for p in posts if p["slug"] not in published_slugs]
    if not unpublished:
        print("⚠️  All articles have been published! Resetting tracker.")
        published["twitter"] = []
        published["linkedin"] = []
        save_published(published)
        unpublished = posts
    # Prioritize articles with specific categories over "IA Générale"
    specialized = [p for p in unpublished if p.get("categories", ["IA Générale"]) != ["IA Générale"]]
    if specialized:
        return random.choice(specialized)
    return random.choice(unpublished)

def generate_tweet(article):
    """Generate a Twitter/X post (max 280 chars)."""
    title = article["title"]
    url = f"{BASE_URL}/blog/{article['slug']}.html"
    cats = article.get("categories", ["IA Générale"])
    emoji = CAT_EMOJIS.get(cats[0], "🤖")
    tags = article.get("tags", [])

    # Build hashtags from tags (max 3)
    hashtags = []
    for tag in tags[:3]:
        ht = "#" + tag.replace(" ", "").replace("&", "").replace("'", "")
        if len(ht) <= 20:
            hashtags.append(ht)
    hashtags_str = " ".join(hashtags)

    # Build tweet
    tweet = f"{emoji} {title}\n\n{hashtags_str} #IA #AI\n\n👉 {url}"

    # Ensure under 280 chars
    if len(tweet) > 280:
        max_title = 280 - len(f"{emoji} \n\n#IA #AI\n\n👉 {url}") - 3
        tweet = f"{emoji} {title[:max_title]}...\n\n#IA #AI\n\n👉 {url}"

    return tweet

def generate_linkedin_post(article):
    """Generate a LinkedIn post (longer format)."""
    title = article["title"]
    excerpt = article.get("excerpt", "")[:200]
    url = f"{BASE_URL}/blog/{article['slug']}.html"
    cats = article.get("categories", ["IA Générale"])
    emoji = CAT_EMOJIS.get(cats[0], "🤖")
    tags = article.get("tags", [])

    hashtags = ["#IntelligenceArtificielle", "#IA", "#AI", "#UseCaseIA"]
    for tag in tags[:2]:
        ht = "#" + tag.replace(" ", "").replace("&", "").replace("'", "")
        if len(ht) <= 25:
            hashtags.append(ht)

    post = f"""{emoji} {title}

{excerpt}...

🔗 Lire l'article complet : {url}

💡 Découvrez comment l'IA peut transformer votre entreprise avec notre Use Case Matcher gratuit :
👉 {BASE_URL}

{" ".join(hashtags)}
"""
    return post

# ── Twitter/X API ──────────────────────────────────────────

def post_to_twitter(tweet_text):
    """Post to Twitter/X using OAuth 1.0a."""
    try:
        from requests_oauthlib import OAuth1
    except ImportError:
        os.system("pip install requests-oauthlib -q")
        from requests_oauthlib import OAuth1

    api_key = os.environ.get("X_API_KEY")
    api_secret = os.environ.get("X_API_SECRET")
    access_token = os.environ.get("X_ACCESS_TOKEN")
    access_secret = os.environ.get("X_ACCESS_SECRET")

    if not all([api_key, api_secret, access_token, access_secret]):
        print("❌ Twitter/X: Missing API credentials")
        return False

    auth = OAuth1(api_key, api_secret, access_token, access_secret)
    url = "https://api.twitter.com/2/tweets"
    payload = {"text": tweet_text}

    response = requests.post(url, json=payload, auth=auth)

    if response.status_code in [200, 201]:
        tweet_id = response.json().get("data", {}).get("id", "")
        print(f"✅ Twitter/X: Tweet publié (ID: {tweet_id})")
        return True
    else:
        print(f"❌ Twitter/X: Erreur {response.status_code} - {response.text}")
        return False

# ── LinkedIn API ──────────────────────────────────────────

def post_to_linkedin(post_text):
    """Post to LinkedIn using the REST API."""
    access_token = os.environ.get("LINKEDIN_ACCESS_TOKEN")

    if not access_token:
        print("❌ LinkedIn: Missing access token")
        return False

    # First, get the user's LinkedIn URN
    headers = {"Authorization": f"Bearer {access_token}", "X-Restli-Protocol-Version": "2.0.0"}
    me_resp = requests.get("https://api.linkedin.com/v2/userinfo", headers=headers)

    if me_resp.status_code != 200:
        print(f"❌ LinkedIn: Cannot fetch profile - {me_resp.status_code} {me_resp.text}")
        return False

    person_id = me_resp.json().get("sub", "")
    author = f"urn:li:person:{person_id}"

    # Create the post
    post_url = "https://api.linkedin.com/v2/ugcPosts"
    payload = {
        "author": author,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": post_text},
                "shareMediaCategory": "NONE"
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"}
    }

    response = requests.post(post_url, json=payload, headers={
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0"
    })

    if response.status_code in [200, 201]:
        post_id = response.json().get("id", "")
        print(f"✅ LinkedIn: Post publié (ID: {post_id})")
        return True
    else:
        print(f"❌ LinkedIn: Erreur {response.status_code} - {response.text}")
        return False

# ── Main ──────────────────────────────────────────────────

def main():
    print(f"\n{'='*60}")
    print(f"🚀 CyberQuantic Social Media Publisher")
    print(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    # Load articles
    with open(POSTS_FILE, "r", encoding="utf-8") as f:
        posts = json.load(f)
    print(f"📚 {len(posts)} articles disponibles")

    # Load published tracker
    published = load_published()
    tw_count = len(published.get("twitter", []))
    li_count = len(published.get("linkedin", []))
    print(f"📊 Déjà publiés: Twitter={tw_count}, LinkedIn={li_count}")

    # Pick article
    article = pick_article(posts, published)
    print(f"\n📝 Article sélectionné: {article['title']}")
    print(f"   Catégorie: {', '.join(article.get('categories', ['IA Générale']))}")
    print(f"   URL: {BASE_URL}/blog/{article['slug']}.html")

    # Generate posts
    tweet = generate_tweet(article)
    linkedin_post = generate_linkedin_post(article)

    print(f"\n--- Tweet ({len(tweet)} chars) ---")
    print(tweet)
    print(f"\n--- LinkedIn Post ---")
    print(linkedin_post[:200] + "...")

    # Publish to Twitter/X
    print(f"\n🐦 Publication Twitter/X...")
    tw_ok = post_to_twitter(tweet)
    if tw_ok:
        published.setdefault("twitter", []).append(article["slug"])

    # Publish to LinkedIn
    print(f"\n💼 Publication LinkedIn...")
    li_ok = post_to_linkedin(linkedin_post)
    if li_ok:
        published.setdefault("linkedin", []).append(article["slug"])

    # Save history
    published.setdefault("history", []).append({
        "date": datetime.now().isoformat(),
        "slug": article["slug"],
        "title": article["title"],
        "twitter": tw_ok,
        "linkedin": li_ok
    })
    save_published(published)

    print(f"\n{'='*60}")
    print(f"✅ Publication terminée")
    remaining = len(posts) - len(set(published.get("twitter", [])))
    print(f"📊 Articles restants: {remaining}/{len(posts)}")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
