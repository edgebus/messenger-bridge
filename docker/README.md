## Application

### Build
```shell
docker build --tag edgebus.example.org/messenger-bridge/local --file docker/Dockerfile .
```

### Run

```shell
docker run --rm --interactive \
  --env DEBUG_WAIT=yes \
  --publish 9229:9229 \
  edgebus.example.org/messenger-bridge/local
```

### Debug

```shell
docker run --rm --interactive --tty \
  --entrypoint /bin/sh \
  edgebus.example.org/messenger-bridge/local
```

## Auto Tests

### Build Tests
```shell
docker build --tag edgebus.example.org/messenger-bridge/local --file docker/Dockerfile .
docker build --tag edgebus.example.org/messenger-bridge/local.test --file docker/Dockerfile.test .
```

### Run Tests
```shell
docker run --interactive --rm edgebus.example.org/messenger-bridge/local.test
```
