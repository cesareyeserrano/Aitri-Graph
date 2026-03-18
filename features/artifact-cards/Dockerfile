# artifact-cards ships as part of the parent project (no new server, no new deps).
# This Dockerfile is a reference copy of the root Dockerfile that includes the
# feature files (js/cards.js, css/cards.css) already present in js/ and css/.
# Build context must be the project root: docker build -f features/artifact-cards/Dockerfile ../../

FROM node:24-alpine

# Non-root user for security
RUN addgroup -S aitri && adduser -S aitri -G aitri

WORKDIR /app

# Copy all application files — includes js/cards.js and css/cards.css added by artifact-cards
COPY ../../server.js     ./
COPY ../../index.html    ./
COPY ../../css/          css/
COPY ../../js/           js/
COPY ../../data/         data/

RUN chown -R aitri:aitri /app

USER aitri

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O- http://localhost:3000/ > /dev/null || exit 1

CMD ["node", "server.js"]
