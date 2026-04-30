## Scope

- [ ] Change is limited to the stated module or bug.
- [ ] No unrelated operational process or UI behavior was rewritten.

## Validation

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`

## Type Safety

- [ ] No new `any` in tenant scoping, queues, or core domain services.
- [ ] If an `any` remains, it is isolated and has a follow-up owner.

## Operational Risk

- [ ] Tenant isolation, branch access, and reporting assumptions were checked when touched.
- [ ] Silent failure paths now log or return an explicit state.
