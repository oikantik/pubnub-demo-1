FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 5173
# Start your frontend application
CMD [ "npm", "run", "dev", "--", "--host", "0.0.0.0"]