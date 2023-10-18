# medplum-fhircast-demo

## Important Files

- `src/components/Publisher.tsx`: The "driver" of the workflow events flow. This component creates `Patient-open` events and submits them to the hub.
- `src/components/Subscriber.tsx`: The "listener" of workflow events. This component subscribes to the `FHIRcast` hub and consumes notifications for `Patient-open` events,
  displaying them in a list in order of most recently received.
- `src/components/ConnectionHandler.tsx`: The actual handler of the `WebSocket` messages coming in from the server for the `Subscriber` component.

## Running the demo

1. Run the Medplum server
2. Run `npm run dev` in this directory
3. Open two windows at `localhost:5173/publisher` and `localhost:5173/subscriber`
