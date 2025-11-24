# Deployment Guide - Render.com

This guide walks you through deploying HIL-AI to Render.com.

## Prerequisites

1. A Render.com account (sign up at https://render.com)
2. Your GitHub repository connected to your Render account

## Deployment Steps

### 1. Connect GitHub to Render

1. Go to https://render.com and sign in
2. Click "New +" → "Web Service"
3. Select "Build and deploy from a Git repository"
4. Click "Connect" next to your GitHub account
5. Search for and select `HIL-AI` repository
6. Click "Connect"

### 2. Configure the Web Service

**Basic Settings:**
- **Name:** `hil-ai` (or any name you prefer)
- **Environment:** `Node`
- **Region:** Choose closest to your users
- **Branch:** `main`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm run server`

### 3. Set Environment Variables

Click "Advanced" and add these environment variables:

```
PORT=3001
NODE_ENV=production
LLM_URL=<your-llm-endpoint>
LLM_MODEL=llama3
```

**Important:** Replace `<your-llm-endpoint>` with:
- **Local Ollama:** Cannot use from Render (no internet access to localhost)
- **Cloud LLM Options:**
  - OpenAI: `https://api.openai.com/v1/chat/completions` (requires `OPENAI_API_KEY`)
  - Ollama Cloud: Deploy Ollama separately and use its endpoint
  - Hugging Face Inference API: Use appropriate endpoint
  - Other OpenAI-compatible APIs: Use their endpoint

### 4. LLM Configuration

**Option A: Using OpenAI (Recommended for free tier testing)**
1. Set `LLM_URL=https://api.openai.com/v1/chat/completions`
2. Add `OPENAI_API_KEY` with your API key
3. Set `LLM_MODEL=gpt-3.5-turbo` (or your preferred model)

**Option B: Self-hosted Ollama**
1. Deploy Ollama to a separate service (e.g., Railway, Fly.io)
2. Get the public URL
3. Set `LLM_URL=https://your-ollama-service.com/v1/chat/completions`

**Option C: Use local testing first**
- Test locally with Ollama: `npm run server`
- Once deployed, update LLM_URL to a cloud service

### 5. Deploy

1. Click "Create Web Service"
2. Render will automatically build and deploy your app
3. Once deployment is complete, you'll get a URL like: `https://hil-ai.onrender.com`
4. Your app is live! 🚀

## After Deployment

### Access Your App
- Frontend: `https://hil-ai.onrender.com`
- API: `https://hil-ai.onrender.com/api/chat`

### View Logs
1. Go to your Render dashboard
2. Click on your service
3. View real-time logs in the "Logs" tab

### Redeploy
- Any push to the `main` branch will automatically trigger a new deployment
- Manual redeploy: Click "Manual Deploy" → "Latest Commit"

### Update Environment Variables
1. Go to your service dashboard
2. Click "Environment"
3. Update variables and save
4. Service will automatically redeploy

## Troubleshooting

### Cold Start
- Free tier services spin down after 15 min of inactivity
- First request will take ~30 seconds (cold start)
- Upgrade to paid tier to prevent this

### LLM Connection Errors
- Check that `LLM_URL` is accessible from Render (not localhost)
- Verify `LLM_MODEL` exists in your LLM service
- Check API keys in environment variables

### Build Failures
- View logs in Render dashboard
- Check that `npm run build` works locally: `npm run build`
- Ensure all dependencies are in `package.json`

### Frontend Not Loading
- Check that Vite build output exists: `npm run build`
- Verify `dist/` folder is in `.gitignore` (it shouldn't be to deploy static files)
- Clear browser cache and hard refresh (Cmd+Shift+R or Ctrl+Shift+R)

## Update .gitignore

The repository includes a `.gitignore` that excludes `node_modules` and `dist`. Render will:
1. Run `npm install` to restore dependencies
2. Run `npm run build` to build the frontend
3. Run `npm run server` to start the server

## Scaling Up

When you're ready to upgrade from free tier:

1. Go to service settings
2. Click "Plan" → Select paid plan
3. Choose resources and confirm
4. Service will redeploy with new resources

Free tier is perfect for development/testing. Paid starts at ~$7/month.

---

**Questions?** Check Render documentation: https://render.com/docs
