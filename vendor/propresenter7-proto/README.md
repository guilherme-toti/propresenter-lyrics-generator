# ProPresenter 7 Protocol Buffer schema

Vendored from [greyshirtguy/ProPresenter7-Proto](https://github.com/greyshirtguy/ProPresenter7-Proto)
(`proto/` directory), MIT licensed — see `LICENSE`.

These are **unofficial, reverse-engineered** `.proto` files describing the
binary format ProPresenter 7 uses for `.pro` documents. They are not
published or supported by Renewed Vision. We load them at runtime with
`protobufjs` (no `protoc` toolchain required) to encode `rv.data.Presentation`
messages — see `src/lib/propresenter/schema.ts`.

Do not hand-edit these files; if the schema needs to change, pull an updated
snapshot from the upstream repository.
