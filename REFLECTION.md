# What I Would Do Differently With More Time

If I had more time, my first priority would be to add some more routes related to managing resources aside from just posts. For example, i woudl add endpoints to list users social accounts, create/remove social accounts, and others of this nature (expanding on the existing infrastructure). Aside from just making it more complete of an app, it would make manual testing significantly easier. Currently, I was just manaully inserting social accounts through mongosh, then copying the id it generated, pasting into the curl… that got old pretty quick.

I would also have liked to build a small front-end for the app. It would not need to be complex, but a simple dashboard for creating posts, filtering scheduled posts, and seeing upcoming posts would make this feel more complete. A front-end would also force me to think about the API design issues in a new way, because it would make me think about the actual user flow instead of just testing with curl.

Another thing I would improve on is the job visibility. The worker currently supports retries and a dead-letter queue, but there is no route for an admin to inspect the dead jobs. With more time, I would add an endpoint for this to show failed jobs, their errors, attempt counts, and timestamps.

The biggst "real-world" upgrade would be connecting to an actual social media API. Publishing is currently simulated with a console.log, which is fine for this small project, but having real social media APIs would introduce many more concepts into this project and make it that much more compelete.

I would also add image and media support. Right now our “posts" are just text, but all real social posts nowadays support images.

Authentication is another obvious way to improve the app. The current auth middleware is stubbed to demonstrate the pattern, but I would replace it with real user sessions or JWTs.

Finally, I’d tighten up some of the reliability details such as adding more test around cache invalidation, PATCH rescheduling, and dead-letter behavior. I would also make post status transitions stricter so clients could not directly set any status they want.