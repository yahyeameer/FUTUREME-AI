#!/bin/bash
# Creates a firewall + a small CPU VM in your Nebius project and starts FutureMe AI on it.
set -euo pipefail

# ---------- settings ----------
PROJECT_ID=project-xxxxxxxxxxxxxxxxxxxx                            # CHANGE ME: your Nebius project ID
VM_NAME=futureme
VM_USER=futureme                                              # CHANGE ME (not root or admin)
SSH_PUBKEY='ssh-ed25519 AAAA...paste-your-key... futureme-nebius'  # CHANGE ME
# ------------------------------

nebius config set parent-id "$PROJECT_ID"

echo "== Finding your network and subnet"
NETWORK_ID=$(nebius vpc network list --format jsonpath='{.items[0].metadata.id}')
SUBNET_ID=$(nebius vpc subnet list --format jsonpath='{.items[0].metadata.id}')
echo "network: $NETWORK_ID   subnet: $SUBNET_ID"

echo "== Creating the firewall (security group)"
SG_ID=$(nebius vpc security-group create \
  --name futureme-web \
  --network-id "$NETWORK_ID" \
  --format jsonpath='{.metadata.id}')

# In: SSH, HTTP, HTTPS and the app's test port.
nebius vpc security-rule create --parent-id "$SG_ID" --name web-in \
  --access allow --protocol tcp --type stateful \
  --ingress-source-cidrs 0.0.0.0/0 \
  --ingress-destination-ports 22,80,443,3000
# Out: everything (Docker images, GitHub, Token Factory). Without this the VM can't reach the internet.
nebius vpc security-rule create --parent-id "$SG_ID" --name all-out \
  --access allow --protocol any --type stateful \
  --egress-destination-cidrs 0.0.0.0/0

echo "== Writing the first-boot setup"
cat > cloud-init.yaml <<EOF
#cloud-config
users:
  - name: $VM_USER
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    ssh_authorized_keys:
      - $SSH_PUBKEY
write_files:
  - path: /usr/local/bin/futureme-setup
    permissions: '0755'
    content: |
      #!/bin/bash
      set -eux
      command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
      usermod -aG docker $VM_USER
      cd /home/$VM_USER
      [ -d futureme-ai ] || git clone -b main https://github.com/yahyeameer/FUTUREME-AI.git futureme-ai
      cd futureme-ai
      [ -f .env ] || printf 'NEBIUS_API_KEY=\nNEBIUS_BASE_URL=https://api.tokenfactory.us-north1.nebius.com/v1/\nNEBIUS_MODEL=nvidia/Nemotron-3.5-Super-VL\nSEED_DEMO=1\n' > .env
      chmod 600 .env
      chown -R $VM_USER:$VM_USER /home/$VM_USER/futureme-ai
      docker compose up -d --build
runcmd:
  - [bash, -c, "/usr/local/bin/futureme-setup > /var/log/futureme-setup.log 2>&1"]
EOF

echo "== Creating the VM (2 vCPU, 8 GB, Ubuntu 24.04, static public IP)"
nebius compute instance create \
  --name "$VM_NAME" \
  --resources-platform cpu-d3 \
  --resources-preset 2vcpu-8gb \
  --boot-disk-managed-disk-name "$VM_NAME-boot" \
  --boot-disk-managed-disk-type network_ssd \
  --boot-disk-managed-disk-size-gibibytes 50 \
  --boot-disk-managed-disk-source-image-family-image-family ubuntu24.04-driverless \
  --boot-disk-attach-mode READ_WRITE \
  --cloud-init-user-data "$(cat cloud-init.yaml)" \
  --network-interfaces "[{\"name\": \"eth0\", \"subnet_id\": \"$SUBNET_ID\", \"ip_address\": {}, \"public_ip_address\": {\"static\": true}, \"security_groups\": [{\"id\": \"$SG_ID\"}]}]" \
  --format jsonpath='{.metadata.id}'
echo

IP=$(nebius compute instance get-by-name --name "$VM_NAME" \
  --format jsonpath='{.status.network_interfaces[0].public_ip_address.address}')
IP=${IP%/*}
echo
echo "Done. VM public IP: $IP"
echo "SSH (from PowerShell):  ssh $VM_USER@$IP"
echo "App (about 10 minutes): http://$IP:3000"
echo "HTTPS name for later:   $IP.sslip.io"
