# Switching libraries without signing in again

There is no "Choose another library" action that keeps a provider sign-in. To move to a different library, the user disconnects, signs in again, and picks the new library root.

## Why this is out of scope

Most people keep one Calibre library, so switching is rare. The existing path costs a couple of extra clicks on that rare occasion. It already works for every provider, through the same connect screen and library-root picker as a first connect.

Keeping a sign-in across a switch would add a second way into the picker, a connection-replacing flow separate from disconnect, and a menu item that shows only for sign-in providers. Each of those has to be built, tested, and explained, and none of it makes the common case of one library better.

## Prior requests

- #143: "Choose another library without signing in again"
