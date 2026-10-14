# Getting started

cloudsesame checks that you're online and logged in to your clouds (gcloud, aws, az) before you start working, and helps you log in when you're not.

```sh
bunx cloudsesame check
```

```
✔ online
✔ gcloud user  me@company.com
✖ gcloud adc   reauthentication required
  → gcloud auth application-default login
✔ aws dev      arn:aws:sts::123456789012:assumed-role/Admin/me
```

With no config it checks every cloud CLI you have installed. To pin accounts, profiles and projects, add a [config file](./configuration).
