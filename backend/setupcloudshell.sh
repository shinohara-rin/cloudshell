#!/bin/sh
# Setup cloudshell environment from a brandnew image

# Install necessary packages
pkg64 install -y llvm-morello vim emacs nano
pkg64c install -y bash tmux curl wget zip unzip git

# Create cloudshell user if it doesn't exist
if ! pw usershow cloudshell >/dev/null 2>&1; then
    mkdir -p /home/cloudshell
    pw user add -n cloudshell -c "Cloud Shell User" -d /home/cloudshell -m -s /usr/local/bin/bash
    chown -R cloudshell /home/cloudshell
fi

# Setup sshd
sed -i '' 's/#PasswordAuth/PasswordAuth/' /etc/ssh/sshd_config

chmod o-r /tmp
chmod -R a-w ~cloudshell
chown -R root:wheel ~cloudshell
mkdir ~cloudshell/.ssh/
cp /root/.ssh/authorized_keys ~cloudshell/.ssh/
chmod 444 ~cloudshell/.ssh/authorized_keys
cat > ~cloudshell/.bashrc <<EOF
force_color_prompt=yes
mkdir \$TEMP_HOME
cd \$TEMP_HOME
export HOME=\$TEMP_HOME
EOF
chmod a+x ~cloudshell/.bashrc

cat <<EOF > /usr/local64/bin/cc
#!/usr/local/bin/bash

clang-morello -march=morello -mabi=purecap "$@"
EOF
chmod a+x /usr/local64/bin/cc
