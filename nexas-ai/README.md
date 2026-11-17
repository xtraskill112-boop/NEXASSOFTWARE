# Nexas AI

A personal AI assistant that runs as a page on claude.ai.

Live page: https://claude.ai/artifact/VzU3fgyKDXehem64rwoqRt

## What it does

- **Chat**: ask anything in English, Hindi or Hinglish.
- **Product listing**: type the product details or add a photo, and get a title, 5 bullet points, a description, search keywords and a category for Amazon, Flipkart, Meesho, Etsy or Shopify.
- **Social post**: 3 caption options plus hashtags for Instagram and Facebook.
- **Customer reply**: paste a customer's message and get a polite reply in English and Hindi.
- **Translate**: English to Hindi, Hindi to English, or any language you name.

It also has voice typing (mic button), read-aloud (Listen button), and Copy on every answer.
The chat is saved in your browser, and the New chat button clears it.

## How it works

`index.html` uses the claude.ai artifact runtime (`window.claude.use("sample")`) to ask Claude.
That means it only works when opened on claude.ai while signed in. It uses the viewer's own
Claude plan, and no API key is needed. Opening the file on its own shows the layout, but it
can't answer.
