FROM node:latest

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY index.js .

EXPOSE 3001
EXPOSE 3002
CMD [ "node", "index.js" ]
