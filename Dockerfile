FROM mcr.microsoft.com/playwright:v1.51.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3088
ENV AUTH_PROFILE_DIR=/app/.auth/chrome-profile
ENV PLAYWRIGHT_CHANNEL=none
ENV PLAYWRIGHT_HEADLESS=true

EXPOSE 3088

CMD ["npm", "start"]
