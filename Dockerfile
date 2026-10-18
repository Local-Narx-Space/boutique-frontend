FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS test
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY public ./public
COPY tests ./tests
COPY ci ./ci
RUN chmod -R a+rX /app
CMD ["sh", "ci/test.sh"]
FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
USER node
EXPOSE 8080
CMD ["node","src/server.js"]
