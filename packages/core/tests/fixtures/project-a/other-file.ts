import type { Foo } from './bloated-file';

function doSomethingElse(foo: Foo): string {
  return foo.bar;
}
