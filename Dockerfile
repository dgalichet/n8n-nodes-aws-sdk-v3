FROM n8nio/n8n:latest

USER root

# Créer le répertoire pour les nodes personnalisés
RUN mkdir -p /home/node/.n8n/custom/node_modules/n8n-nodes-aws-sdk-v3

# Copier le package.json et installer les dépendances
COPY package.json /home/node/.n8n/custom/node_modules/n8n-nodes-aws-sdk-v3/
WORKDIR /home/node/.n8n/custom/node_modules/n8n-nodes-aws-sdk-v3

# Installer les dépendances de production
RUN npm install --omit=dev

# Copier le code compilé
COPY dist/ /home/node/.n8n/custom/node_modules/n8n-nodes-aws-sdk-v3/dist/

# S'assurer que les permissions sont correctes
RUN chown -R node:node /home/node/.n8n

USER node

WORKDIR /home/node
