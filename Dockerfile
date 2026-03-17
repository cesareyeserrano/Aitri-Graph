FROM node:24-alpine

# Non-root user for security
RUN addgroup -S aitri && adduser -S aitri -G aitri

WORKDIR /app

# Copy only application files (no node_modules — zero npm deps)
COPY server.js     ./
COPY index.html    ./
COPY css/          css/
COPY js/           js/
COPY data/         data/

# Set ownership before switching user
RUN chown -R aitri:aitri /app

USER aitri

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O- http://localhost:3000/ > /dev/null || exit 1

CMD ["node", "server.js"]
