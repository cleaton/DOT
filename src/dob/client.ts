type WebCallbacks<T> = {
    onMsg: (msg: T) => void;
    onConnect: () => void;
    onDisconnect: () => void;
  };
  
  class DobWebApi<T> {
    private errors: number = 0;
    private socket?: WebSocket;
    private shouldClose: boolean = false;
    public join(callbacks: WebCallbacks<T>) {
      if (this.socket) return; // invalid. if we have already joined, need to close first.
      const socket = new WebSocket("ws://localhost:8080");
  
      // Connection opened
      socket.addEventListener("open", (event) => {
        this.errors = 0;
        this.socket = socket;
        callbacks.onConnect();
      });
  
      // Listen for messages
      socket.addEventListener("message", (event) => {
        callbacks.onMsg(JSON.parse(event.data as string))
        console.log("Message from server ", event.data);
      });
  
      // Listen for error
      socket.addEventListener("error", (event) => {
        //callbacks.onDisconnect();
        console.log("Error from server ", event.error);
      });
  
      // Listen for close
      socket.addEventListener("close", (event) => {
        ++this.errors;
        callbacks.onDisconnect();
        this.socket = undefined;
        if (!this.shouldClose) {
          setTimeout(() => this.join(callbacks), Math.max(this.errors * 250, 10_000))
        } else {
          this.shouldClose = false;
        }
        
        console.log("Close from server ", event.wasClean);
      });
    }
    public close() {
      if (this.socket) {
        this.shouldClose = true
        this.socket.close();
      }
    }
  }