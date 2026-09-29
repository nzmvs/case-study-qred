# The official stoplight/prism image crashes on startup (createMultiProcessPrism), so run the npm package instead.
FROM node:22-alpine
RUN npm install --global @stoplight/prism-cli@5.16.0
ENTRYPOINT ["prism", "mock", "--host", "0.0.0.0", "--port", "4010"]
