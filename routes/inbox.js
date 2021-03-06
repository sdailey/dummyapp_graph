const router = require('express-promise-router')();
const graph = require('../graph.js');
const addDays = require('date-fns/addDays');
const formatISO = require('date-fns/formatISO');
const startOfWeek = require('date-fns/startOfWeek');
const zonedTimeToUtc = require('date-fns-tz/zonedTimeToUtc');
const iana = require('windows-iana');
const { body, validationResult } = require('express-validator');
const validator = require('validator');

/* GET email */
router.get('/',
  async function(req, res) {
    if (!req.session.userId) {
      // Redirect unauthenticated requests to home page
      res.redirect('/')
    } else {
      const params = {
        active: { inbox: true }
      };
      
      // Get the user
      const user = req.app.locals.users[req.session.userId];
      // Convert user's Windows time zone ("Pacific Standard Time")
      // to IANA format ("America/Los_Angeles")
      const timeZoneId = iana.findIana(user.timeZone)[0];
      
      // console.log(`Time zone: ${timeZoneId.valueOf()}`);

      // // Calculate the start and end of the current week
      // // Get midnight on the start of the current week in the user's timezone,
      // // but in UTC. For example, for Pacific Standard Time, the time value would be
      // // 07:00:00Z
      // var weekStart = zonedTimeToUtc(startOfWeek(new Date()), timeZoneId.valueOf());
      // var weekEnd = addDays(weekStart, 7);
      // console.log(`Start: ${formatISO(weekStart)}`);
      
      
      try {
        // Get messages --> https://docs.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0&tabs=javascript
        
        const messages = await graph.getEmails(
          req.app.locals.msalClient,
          req.session.userId,
          10
        );
        
        // Get the events
        // const events = await graph.getCalendarView(
        //   req.app.locals.msalClient,
        //   req.session.userId,
        //   formatISO(weekStart),
        //   formatISO(weekEnd),
        //   user.timeZone);

      //   res.json(events.value);
      // } catch (err) {
      //   res.send(JSON.stringify(err, Object.getOwnPropertyNames(err)));
      // }
      
        // Assign the events to the view parameters
        // params.events = events.value;
        
        params.messages = messages.value;
      } catch (err) {
        req.flash('error_msg', {
          message: 'Could not fetch events',
          debug: JSON.stringify(err, Object.getOwnPropertyNames(err))
        });
      }

      res.render('inbox', params);
    }
  }
);

router.get('/new',
  function(req, res) {
    if (!req.session.userId) {
      // Redirect unauthenticated requests to home page
      res.redirect('/')
    } else {
      res.locals.newEvent = {};
      res.render('newemail'); // views/newemail.hbs
    }
  }
);

/* POST /calendar/new */
router.post('/new', [ // the array brackets here are not necessary
    body('em-subject').escape(),
    // Custom sanitizer converts ;-delimited string
    // to an array of strings
    body('em-recipients').customSanitizer(value => {
      return value.split(';');
    // Custom validator to make sure each
    // entry is an email address
    }).custom(value => {
      value.forEach(element => {
        if (!validator.isEmail(element)) {
          throw new Error('Invalid email address');
        }
      });

      return true;
    }),
    // Ensure start and end are ISO 8601 date-time values
    // body('ev-start').isISO8601(),
    
    body('em-body').escape()
  ], async function(req, res) {
    if (!req.session.userId) {
      // Redirect unauthenticated requests to home page
      res.redirect('/')
    } else {
      // Build an object from the form values
      const formData = {
        subject: req.body['em-subject'],
        importance: 'Low',
        toRecipients: req.body['em-recipients'],
        
        body: req.body['em-body']
      };

      // Check if there are any errors with the form values
      const formErrors = validationResult(req);
      if (!formErrors.isEmpty()) {

        let invalidFields = '';
        formErrors.errors.forEach(error => {
          invalidFields += `${error.param.slice(3, error.param.length)},`
        });

        // Preserve the user's input when re-rendering the form
        // Convert the attendees array back to a string
        formData.toRecipients = formData.toRecipients.join(';');
        return res.render('newemail', {
          newEvent: formData,
          error: [{ message: `Invalid input in the following fields: ${invalidFields}` }]
        });
      }

      // Get the user
      const user = req.app.locals.users[req.session.userId];

      // Create the event
      try {
        await graph.sendEmail(
          req.app.locals.msalClient,
          req.session.userId,
          formData
        );
      } catch (error) {
        req.flash('error_msg', {
          message: 'Could not create email',
          debug: JSON.stringify(error, Object.getOwnPropertyNames(error))
        });
      }

      // Redirect back to the calendar view
      return res.redirect('/inbox');
    }
  }
);
module.exports = router;