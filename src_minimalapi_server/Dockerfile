# Build context is the REPOSITORY ROOT, not this folder: central package management
# (Directory.Packages.props), the SDK pin (global.json) and the feed list (nuget.config)
# all live there, and a build that cannot see them resolves different versions than CI.
#
#   docker build -f src_minimalapi_server/Dockerfile -t cred-vault-server .
#
# The publish is NATIVE AOT: the runtime stage carries no .NET at all — one static
# binary on runtime-deps. Build per-architecture on a native runner (TARGETARCH is
# honoured), then stitch a manifest; AOT does not cross-compile inside qemu.

# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /source

# Native AOT links with the platform toolchain — this is the whole extra cost.
RUN apt-get update     && apt-get install -y --no-install-recommends clang zlib1g-dev     && rm -rf /var/lib/apt/lists/*

# Restore on the project files alone first, so a source-only edit reuses this layer.
COPY global.json nuget.config Directory.Build.props Directory.Packages.props ./
COPY src_minimalapi_server/src/CredVaultServer.csproj src_minimalapi_server/src/
RUN dotnet restore src_minimalapi_server/src/CredVaultServer.csproj -a $TARGETARCH

COPY src_minimalapi_server/src/ src_minimalapi_server/src/
RUN dotnet publish src_minimalapi_server/src/CredVaultServer.csproj         -c Release         -a $TARGETARCH         -o /app         --no-restore

# ---------------------------------------------------------------------------
# runtime — no .NET runtime: the binary IS the app
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/runtime-deps:10.0 AS runtime

# curl is here only so HEALTHCHECK below can be a real request rather than a guess.
RUN apt-get update     && apt-get install -y --no-install-recommends curl     && rm -rf /var/lib/apt/lists/*

# A dedicated unprivileged account. The data directory is the ONLY path the app may
# write, which is what lets the container run with a read-only root filesystem.
RUN groupadd --system --gid 10001 vault     && useradd --system --uid 10001 --gid vault --no-create-home vault     && mkdir -p /data     && chown -R vault:vault /data

WORKDIR /app
COPY --from=build --chown=root:root /app/CredVaultServer /app/appsettings.json ./

ENV ASPNETCORE_URLS=http://+:8080     ASPNETCORE_ENVIRONMENT=Production     Vault__DataDir=/data     Logging__Directory=/logs

EXPOSE 8080
VOLUME ["/data", "/logs"]

USER vault

# The app answers /api/health by probing that the data directory is writable, so this
# check fails when the volume is gone or full — the failure modes that actually strand
# a 24/7 deployment — and not merely when the process is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3     CMD curl --fail --silent --show-error http://127.0.0.1:8080/api/health || exit 1

ENTRYPOINT ["./CredVaultServer"]
