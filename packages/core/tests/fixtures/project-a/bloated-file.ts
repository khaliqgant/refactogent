export interface Foo {
  bar: string;
}

function doSomething(foo: Foo): string {
  return foo.bar;
}
