FROM node:20-slim

# Working directory
WORKDIR /app

# Copy package.json
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
