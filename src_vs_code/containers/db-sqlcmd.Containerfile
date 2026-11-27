# The ODBC sqlcmd of a bridged database query on Windows (change 11.1, the 72-hour slice, S3).
#
# On Windows no (client, system) pair of the profile table is served, so a bridged query runs its client in a Linux container on the laptop,
# built from THIS file (`wslc build`, by the registration command) and started by its image id. The client is the build the CI legs ran:
# mssql-tools18 18.7.1.1 (`sqlcmd` 18.7.0001.1) with msodbcsql18 18.7.1.1, on Ubuntu 24.04, both pinned to the exact package revision; the
# extension checks the version line and the driver file inside the image before it serves it (bridgedDbProfile.ts, the `container` row).
# A Linux container has no Windows sign-in, so the Windows roads (SSPI, the person's Windows identity) do not exist here.
#
# Microsoft's signing key is checked against a checksum before apt trusts it, as the CI's `database clients` job does. The base is pinned by
# digest. The client runs as nobody (65534); the run adds `--cap-drop ALL` and `--pull never` (no memory limit: wslc prints a swap warning for it).
FROM ubuntu@sha256:562111b88caa79c71391c0c4d3c2114a7d5c35915c20561fd893cb1e07929e6b

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && curl --proto '=https' --tlsv1.2 -fsSL -o /tmp/microsoft.asc https://packages.microsoft.com/keys/microsoft.asc \
 && echo "2fa9c05d591a1582a9aba276272478c262e95ad00acf60eaee1644d93941e3c6  /tmp/microsoft.asc" | sha256sum -c - \
 && gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg /tmp/microsoft.asc \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/ubuntu/24.04/prod noble main" > /etc/apt/sources.list.d/mssql-release.list \
 && apt-get update \
 && ACCEPT_EULA=Y DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends msodbcsql18=18.7.1.1-1 mssql-tools18=18.7.1.1-1 unixodbc libgssapi-krb5-2 \
 && apt-get purge -y curl gnupg \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* /tmp/microsoft.asc

USER 65534:65534
ENTRYPOINT []
CMD ["/opt/mssql-tools18/bin/sqlcmd", "-?"]
