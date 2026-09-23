FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Set AFTER the build on purpose: npm install must still see the dev
# dependencies (vite, esbuild, typescript) that the build needs. Setting this
# earlier would make `npm install` skip them and break the build.
ENV NODE_ENV=production

ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]