## Examples

```js
var thread = weaver.thread();

thread.pon('ran').then(function(){
  console.log('thread ran promise resolved');
});

thread.run(function(){
  resolve('thread has finished');
}).then(function(){
  thread.stop();
});
```