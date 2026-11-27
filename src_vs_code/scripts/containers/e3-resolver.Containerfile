# The image of probe P2 of E3.S3 (`research/PLAN_person_roads_pin_host_key_E3_S3_spec.md`): the counterpart, the client and `ps` in a Debian 12 container, with
# Node 22 (CI's major) for the harness and for the resolver the run owns. Built by hand, once:
#   wslc build -f scripts/containers/e3-resolver.Containerfile -t creds-itest-e3-resolver:<YYYYMMDD> scripts/containers
# `procps` is needed by `endServer` (`ps`). `/run/sshd` is the privilege-separation folder that `sshd` looks for. Nothing else is added: the harness
# comes in by a read-only mount at the container's start, and no secret or key is built into the image.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-client openssh-server procps \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /run/sshd
