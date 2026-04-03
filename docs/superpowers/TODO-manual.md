# Manual TODOs (require human action)

## Install Klassenzeit GitHub Actions Runner

**Status:** Runner configured, needs sudo to install as service

The runner binary is set up at `/home/pascal/actions-runner-klassenzeit` and registered with GitHub. Just needs the systemd service installed and started:

```bash
cd /home/pascal/actions-runner-klassenzeit
sudo ./svc.sh install pascal
sudo ./svc.sh start
```

Verify it's online:
```bash
gh api /repos/Spycner/Klassenzeit/actions/runners
# Should show runner "iuno-klassenzeit" with status "online"
```

After this, the deploy-staging and deploy-prod workflows will be able to run on this self-hosted runner. The docker compose files still need to be created (separate task).
